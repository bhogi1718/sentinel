// Lightweight per-session companion to sentinel-agent.exe. Runs as the
// logged-in interactive user (started via a Scheduled Task with an
// at-logon trigger, not the LocalSystem Windows Service), where it has
// natural, ACL-free access to the interactive desktop. Its only job is to
// answer "which processes currently own a visible top-level window" over
// a named pipe - see windows_apps.rs's doc comment for why this is a
// separate process at all rather than the main service just doing this
// itself.
//
// Release builds link as the Windows GUI subsystem so the process never
// gets a console window of its own - it's a background per-session helper
// launched by a Scheduled Task, and a stray console flashing up (or sitting
// open) on every logon is just noise. Debug builds keep the console so
// `cargo run` still shows live logs. With no console in release, stdout
// logging would go nowhere, so logging is redirected to a rolling file (see
// init_helper_logging).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod annotation_overlay;
mod helper_ipc;
mod stream_indicator;
mod processes {
    pub mod screenshot;
    pub mod windows_apps;
}

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::windows::named_pipe::ServerOptions;

use helper_ipc::{HelperRequest, ScreenshotHeader, StreamFrameHeader, WindowedPidsResponse};

/// Requests are newline-terminated JSON - this bounds how much the server
/// will buffer from a client before giving up, so a misbehaving or
/// malicious local connection can't make it allocate unbounded memory
/// waiting for a newline that never arrives. 64 KiB comfortably fits an
/// Annotate request carrying a page's worth of freehand strokes while still
/// being a hard cap.
const MAX_REQUEST_LINE_BYTES: usize = 64 * 1024;

#[tokio::main]
async fn main() {
    // Held for the process lifetime: in release this owns the non-blocking
    // file-writer's worker, which stops flushing the moment it's dropped, so
    // it must outlive every log call below rather than just the subscriber
    // setup. In debug it's None (console logging needs no guard).
    let _log_guard = init_helper_logging();

    tracing::info!("Sentinel Agent Helper starting, listening on {}", helper_ipc::PIPE_NAME);

    // Owns the on-screen "being viewed" banner shown while a live view is
    // active. Runs on its own thread with its own window message loop.
    // Can be turned off by the device owner via `show_view_indicator =
    // false` in agent.toml (default on).
    if show_view_indicator() {
        stream_indicator::spawn();
    } else {
        tracing::info!("On-screen 'being viewed' indicator disabled by config");
    }

    // Owns the transparent, click-through shared-annotation overlay.
    annotation_overlay::spawn();

    let security_attributes = match helper_ipc::PipeSecurityAttributes::build() {
        Ok(attrs) => attrs,
        Err(e) => {
            tracing::error!("Failed to build pipe security descriptor: {e}. Exiting.");
            return;
        }
    };

    loop {
        // SAFETY: security_attributes.as_ptr() points at a SECURITY_ATTRIBUTES
        // that outlives this call (owned by the enclosing scope, dropped only
        // at process exit), satisfying create_with_security_attributes_raw's
        // safety contract.
        let server = match unsafe {
            ServerOptions::new().create_with_security_attributes_raw(helper_ipc::PIPE_NAME, security_attributes.as_ptr())
        } {
            Ok(server) => server,
            Err(e) => {
                tracing::error!("Failed to create named pipe server: {e}. Retrying in 5s...");
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                continue;
            }
        };

        if let Err(e) = server.connect().await {
            tracing::error!("Failed to accept pipe connection: {e}");
            continue;
        }

        let mut server = server;

        let request = match read_request(&mut server).await {
            Ok(request) => request,
            Err(e) => {
                tracing::error!("Failed to read request from pipe: {e}");
                continue;
            }
        };

        if let Err(e) = handle_request(&mut server, request).await {
            tracing::error!("Failed to handle request: {e}");
        }

        if let Err(e) = server.shutdown().await {
            tracing::warn!("Failed to shut down pipe after write: {e}");
        }

        // ServerOptions::create's handle is single-use per client - the
        // loop re-creates the pipe instance for the next connection, same
        // pattern the tokio named_pipe docs recommend for a "listen
        // forever" server.
        drop(server);
    }
}

/// Initializes logging. Debug builds have a console (see the crate-level
/// `windows_subsystem` attribute) so they log to stdout and need no guard.
/// Release builds have no console, so they log to a rolling daily file next
/// to the exe - same convention as the service (service.rs), with a distinct
/// filename prefix so the two processes sharing that folder don't collide.
/// The returned guard must be held for the process lifetime.
fn init_helper_logging() -> Option<tracing_appender::non_blocking::WorkerGuard> {
    let filter = tracing_subscriber::EnvFilter::from_default_env().add_directive("info".parse().unwrap());

    #[cfg(debug_assertions)]
    {
        tracing_subscriber::fmt().with_env_filter(filter).init();
        None
    }

    #[cfg(not(debug_assertions))]
    {
        let log_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .unwrap_or_else(|| std::path::PathBuf::from("."));

        let file_appender = tracing_appender::rolling::daily(log_dir, "sentinel-agent-helper.log");
        let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);

        tracing_subscriber::fmt()
            .with_writer(non_blocking)
            .with_ansi(false)
            .with_env_filter(filter)
            .init();

        Some(guard)
    }
}

/// Whether to show the on-screen "being viewed" banner during a live view.
/// Reads `show_view_indicator` from agent.toml next to the helper exe
/// (where install-service.ps1 copies it). Defaults to true - the indicator
/// is shown unless the owner explicitly opts out - and defaults to true on
/// any read/parse error too, so a missing or malformed config never
/// silently disables the affordance.
fn show_view_indicator() -> bool {
    #[derive(serde::Deserialize)]
    struct IndicatorConfig {
        #[serde(default = "yes")]
        show_view_indicator: bool,
    }
    fn yes() -> bool {
        true
    }

    let config_path = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.join("agent.toml")));

    let Some(path) = config_path else { return true };
    let Ok(contents) = std::fs::read_to_string(&path) else { return true };
    match toml::from_str::<IndicatorConfig>(&contents) {
        Ok(cfg) => cfg.show_view_indicator,
        Err(_) => true,
    }
}

/// Reads a single newline-terminated JSON request line from the client.
async fn read_request(
    server: &mut tokio::net::windows::named_pipe::NamedPipeServer,
) -> Result<HelperRequest, String> {
    let mut buf = Vec::new();
    let mut byte = [0u8; 1];

    loop {
        let n = server.read(&mut byte).await.map_err(|e| format!("pipe read error: {e}"))?;
        if n == 0 {
            return Err("client closed the pipe before sending a complete request".to_string());
        }
        if byte[0] == b'\n' {
            break;
        }
        buf.push(byte[0]);
        if buf.len() > MAX_REQUEST_LINE_BYTES {
            return Err(format!("request line exceeded {MAX_REQUEST_LINE_BYTES} bytes"));
        }
    }

    serde_json::from_slice(&buf).map_err(|e| format!("malformed request JSON: {e}"))
}

async fn handle_request(
    server: &mut tokio::net::windows::named_pipe::NamedPipeServer,
    request: HelperRequest,
) -> Result<(), String> {
    match request {
        HelperRequest::WindowedPids => {
            let pids = processes::windows_apps::windowed_pids();
            let response = WindowedPidsResponse { pids: pids.into_iter().collect() };
            let payload = serde_json::to_vec(&response).map_err(|e| format!("failed to serialize response: {e}"))?;
            server.write_all(&payload).await.map_err(|e| format!("failed to write response: {e}"))?;
        }
        HelperRequest::Screenshot => {
            // GDI capture is a blocking, CPU-bound Win32 call sequence -
            // running it inline would stall this task's async executor
            // (and, since the helper is single-threaded by default, every
            // other in-flight connection) for however long capture takes.
            let capture_result = tokio::task::spawn_blocking(processes::screenshot::capture_virtual_screen_png)
                .await
                .map_err(|e| format!("screenshot capture task panicked: {e}"))?;

            let (png_bytes, error) = match capture_result {
                Ok(bytes) => (bytes, None),
                Err(e) => (Vec::new(), Some(e)),
            };

            let header = ScreenshotHeader { error, png_byte_len: png_bytes.len() as u32 };
            let header_bytes = serde_json::to_vec(&header).map_err(|e| format!("failed to serialize header: {e}"))?;

            server
                .write_all(&(header_bytes.len() as u32).to_le_bytes())
                .await
                .map_err(|e| format!("failed to write header length: {e}"))?;
            server.write_all(&header_bytes).await.map_err(|e| format!("failed to write header: {e}"))?;
            if !png_bytes.is_empty() {
                server.write_all(&png_bytes).await.map_err(|e| format!("failed to write PNG bytes: {e}"))?;
            }
        }
        HelperRequest::StreamFrame { max_width, quality } => {
            // Keep the "being viewed" banner up: every frame request
            // refreshes its activity timestamp (see stream_indicator).
            stream_indicator::notify_active();

            // Same blocking-capture-off-the-executor reasoning as the
            // Screenshot arm above, plus a JPEG downscale+encode.
            let capture_result =
                tokio::task::spawn_blocking(move || processes::screenshot::capture_virtual_screen_jpeg(max_width, quality))
                    .await
                    .map_err(|e| format!("stream frame capture task panicked: {e}"))?;

            let (jpeg_bytes, error) = match capture_result {
                Ok(bytes) => (bytes, None),
                Err(e) => (Vec::new(), Some(e)),
            };

            let header = StreamFrameHeader { error, jpeg_byte_len: jpeg_bytes.len() as u32 };
            let header_bytes = serde_json::to_vec(&header).map_err(|e| format!("failed to serialize header: {e}"))?;

            server
                .write_all(&(header_bytes.len() as u32).to_le_bytes())
                .await
                .map_err(|e| format!("failed to write header length: {e}"))?;
            server.write_all(&header_bytes).await.map_err(|e| format!("failed to write header: {e}"))?;
            if !jpeg_bytes.is_empty() {
                server.write_all(&jpeg_bytes).await.map_err(|e| format!("failed to write JPEG bytes: {e}"))?;
            }
        }
        HelperRequest::Annotate { shapes } => {
            // Display-only: hand the shapes to the overlay window. No
            // response body - this is fire-and-forget from the service.
            annotation_overlay::set_shapes(shapes);
        }
        HelperRequest::AnnotateClear => {
            annotation_overlay::clear();
        }
    }

    Ok(())
}
