// Lightweight per-session companion to sentinel-agent.exe. Runs as the
// logged-in interactive user (started via a Scheduled Task with an
// at-logon trigger, not the LocalSystem Windows Service), where it has
// natural, ACL-free access to the interactive desktop. Its only job is to
// answer "which processes currently own a visible top-level window" over
// a named pipe - see windows_apps.rs's doc comment for why this is a
// separate process at all rather than the main service just doing this
// itself.
mod helper_ipc;
mod processes {
    pub mod screenshot;
    pub mod windows_apps;
}

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::windows::named_pipe::ServerOptions;

use helper_ipc::{HelperRequest, ScreenshotHeader, WindowedPidsResponse};

/// Requests are small, newline-terminated JSON - this bounds how much the
/// server will buffer from a client before giving up, so a misbehaving or
/// malicious local connection can't make it allocate unbounded memory
/// waiting for a newline that never arrives.
const MAX_REQUEST_LINE_BYTES: usize = 256;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env().add_directive("info".parse().unwrap()))
        .init();

    tracing::info!("Sentinel Agent Helper starting, listening on {}", helper_ipc::PIPE_NAME);

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
    }

    Ok(())
}
