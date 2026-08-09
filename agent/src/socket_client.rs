use rust_socketio::asynchronous::{Client, ClientBuilder};
use rust_socketio::Payload;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{oneshot, Notify};
use tracing::{error, info, warn};

use crate::commands::executor;
use crate::commands::{CommandRequest, CommandType};
use crate::events::types::{EventType, ReportedEvent};
use crate::files::{self, FileDownloadRequest, FileListRequest};
use crate::metrics::{self, MetricsRequest};
use crate::processes::{self, ProcessListRequest};
use crate::screenshot::{self, ScreenshotRequest};

const RECONNECT_DELAY: Duration = Duration::from_secs(5);

/// A connected client plus the handle used to force a reconnect if this
/// client turns out to be unable to actually send (see connect()'s doc
/// comment). Published together via the watch channel in agent_runtime.rs
/// so every watcher that reports events has access to both.
pub type ConnectedClient = (Client, Arc<Notify>);

pub struct SocketClient {
    server_url: String,
    device_token: String,
    browse_root: PathBuf,
}

impl SocketClient {
    pub fn new(server_url: String, device_token: String, browse_root: PathBuf) -> Self {
        Self {
            server_url,
            device_token,
            browse_root,
        }
    }

    /// Connects to the /agent namespace, retrying indefinitely with a fixed
    /// delay on failure. Returns the connected client, a receiver that
    /// resolves the moment the server-side "disconnect" event fires, and a
    /// shared Notify that any event handler can trigger to force an
    /// immediate reconnect - so the caller knows exactly when to reconnect
    /// instead of polling.
    ///
    /// The Notify exists because rust_socketio's disconnect callback is
    /// purely read-driven: a failed emit() (e.g. a dead TCP connection)
    /// does NOT flip the crate's internal connected state or fire its
    /// disconnect callback on its own - it only returns an Err to the
    /// caller. Without this, a single failed emit leaves the client in a
    /// zombie state that looks "connected" forever while unable to send or
    /// receive anything. Every handler below that emits must call
    /// force_reconnect.notify_one() on failure rather than just logging it.
    ///
    /// Crucially, this does not return until the namespace-level "connect"
    /// event has actually fired. `ClientBuilder::connect()` resolving only
    /// means the namespace CONNECT packet was *sent* - the server's ack that
    /// the socket has actually joined the namespace arrives asynchronously
    /// afterward. Emitting before that ack completes gets silently dropped
    /// server-side, since the socket isn't considered part of the namespace
    /// yet.
    pub async fn connect(&self) -> (Client, oneshot::Receiver<()>, Arc<Notify>) {
        loop {
            let auth = serde_json::json!({ "token": self.device_token });
            let (disconnect_tx, disconnect_rx) = oneshot::channel::<()>();
            let disconnect_tx = std::sync::Arc::new(std::sync::Mutex::new(Some(disconnect_tx)));
            let (ready_tx, ready_rx) = oneshot::channel::<()>();
            let ready_tx = std::sync::Arc::new(std::sync::Mutex::new(Some(ready_tx)));
            let force_reconnect = Arc::new(Notify::new());

            let result = ClientBuilder::new(self.server_url.clone())
                .namespace("/agent")
                .auth(auth)
                // rust_socketio maps the string "open" (not "connect") to
                // Event::Connect - "connect" would silently register a
                // no-op custom event that the server never emits.
                .on("open", {
                    let ready_tx = ready_tx.clone();
                    move |_, _| {
                        let ready_tx = ready_tx.clone();
                        Box::pin(async move {
                            if let Some(tx) = ready_tx.lock().unwrap().take() {
                                let _ = tx.send(());
                            }
                        })
                    }
                })
                .on("connect_error", |payload, _| {
                    Box::pin(async move {
                        error!("Agent socket connect_error: {:?}", payload);
                    })
                })
                .on("command:execute", {
                    let force_reconnect = force_reconnect.clone();
                    move |payload, client| {
                        let force_reconnect = force_reconnect.clone();
                        Box::pin(async move {
                            handle_command(payload, client, force_reconnect).await;
                        })
                    }
                })
                .on("process:list:request", {
                    let force_reconnect = force_reconnect.clone();
                    move |payload, client| {
                        let force_reconnect = force_reconnect.clone();
                        Box::pin(async move {
                            handle_process_list_request(payload, client, force_reconnect).await;
                        })
                    }
                })
                .on("metrics:request", {
                    let force_reconnect = force_reconnect.clone();
                    move |payload, client| {
                        let force_reconnect = force_reconnect.clone();
                        Box::pin(async move {
                            handle_metrics_request(payload, client, force_reconnect).await;
                        })
                    }
                })
                .on("files:list:request", {
                    let browse_root = self.browse_root.clone();
                    let force_reconnect = force_reconnect.clone();
                    move |payload, client| {
                        let browse_root = browse_root.clone();
                        let force_reconnect = force_reconnect.clone();
                        Box::pin(async move {
                            handle_files_list_request(payload, client, browse_root, force_reconnect).await;
                        })
                    }
                })
                .on("files:download:request", {
                    let browse_root = self.browse_root.clone();
                    let force_reconnect = force_reconnect.clone();
                    move |payload, client| {
                        let browse_root = browse_root.clone();
                        let force_reconnect = force_reconnect.clone();
                        Box::pin(async move {
                            handle_files_download_request(payload, client, browse_root, force_reconnect).await;
                        })
                    }
                })
                .on("screenshot:request", {
                    let force_reconnect = force_reconnect.clone();
                    move |payload, client| {
                        let force_reconnect = force_reconnect.clone();
                        Box::pin(async move {
                            handle_screenshot_request(payload, client, force_reconnect).await;
                        })
                    }
                })
                .on("disconnect", {
                    let disconnect_tx = disconnect_tx.clone();
                    move |_, _| {
                        let disconnect_tx = disconnect_tx.clone();
                        Box::pin(async move {
                            warn!("Agent socket disconnected");
                            if let Some(tx) = disconnect_tx.lock().unwrap().take() {
                                let _ = tx.send(());
                            }
                        })
                    }
                })
                .connect()
                .await;

            match result {
                Ok(client) => {
                    // Wait for the namespace connect ack, with a bounded
                    // timeout so a server that never acks doesn't hang the
                    // agent forever - if it times out, loop and retry.
                    match tokio::time::timeout(Duration::from_secs(10), ready_rx).await {
                        Ok(Ok(())) => {
                            info!("Connected to Sentinel backend at {}", self.server_url);
                            return (client, disconnect_rx, force_reconnect);
                        }
                        _ => {
                            error!("Namespace connect ack not received in time. Retrying in {:?}...", RECONNECT_DELAY);
                            tokio::time::sleep(RECONNECT_DELAY).await;
                        }
                    }
                }
                Err(e) => {
                    error!("Failed to connect to backend: {e}. Retrying in {:?}...", RECONNECT_DELAY);
                    tokio::time::sleep(RECONNECT_DELAY).await;
                }
            }
        }
    }

    /// Emits an event:report and waits for the server's ack (up to the given
    /// timeout) before returning, logging the true outcome. Emitting
    /// successfully only means the packet was sent - it says nothing about
    /// whether the server actually received and processed it, so this
    /// function does not consider the report "done" until the ack callback
    /// itself fires.
    pub async fn report_event(client: &Client, event: ReportedEvent, force_reconnect: &Notify) {
        const ACK_TIMEOUT: Duration = Duration::from_secs(10);

        let payload = match serde_json::to_value(&event) {
            Ok(v) => v,
            Err(e) => {
                error!("Failed to serialize event {:?}: {e}", event.event_type);
                return;
            }
        };

        let (ack_tx, ack_rx) = oneshot::channel::<Payload>();
        let ack_tx = std::sync::Arc::new(std::sync::Mutex::new(Some(ack_tx)));

        let emit_result = client
            .emit_with_ack(
                "event:report",
                payload,
                ACK_TIMEOUT,
                move |ack: Payload, _| {
                    let ack_tx = ack_tx.clone();
                    Box::pin(async move {
                        if let Some(tx) = ack_tx.lock().unwrap().take() {
                            let _ = tx.send(ack);
                        }
                    })
                },
            )
            .await;

        if let Err(e) = emit_result {
            error!("Failed to send event {:?}: {e}", event.event_type);
            force_reconnect.notify_one();
            return;
        }

        match tokio::time::timeout(ACK_TIMEOUT, ack_rx).await {
            Ok(Ok(ack)) => info!("Reported event {} (server ack: {:?})", event.event_type, ack),
            Ok(Err(_)) => error!("Ack channel closed before receiving a response for event {:?}", event.event_type),
            Err(_) => error!("No ack received from server for event {:?} within {ACK_TIMEOUT:?}", event.event_type),
        }
    }
}

/// Handles an incoming command:execute from the server. The server has no
/// way to receive a Socket.IO-style ack reply from this crate (see
/// executor module docs), so the outcome is reported back via a plain
/// command:ack event instead, carrying the same commandId the server sent.
async fn handle_command(payload: Payload, client: Client, force_reconnect: Arc<Notify>) {
    let Payload::Text(values) = payload else {
        error!("command:execute payload was not the expected Text variant");
        return;
    };

    let Some(first) = values.first() else {
        error!("command:execute payload was empty");
        return;
    };

    let request: CommandRequest = match serde_json::from_value(first.clone()) {
        Ok(r) => r,
        Err(e) => {
            error!("Failed to parse command:execute payload: {e}");
            return;
        }
    };

    info!("Executing command {:?} (id: {})", request.command_type, request.command_id);

    // Windows gives no passive observer (WM_QUERYENDSESSION, the SCM's
    // Shutdown control) any way to tell a restart from a plain shutdown -
    // only the caller of ExitWindowsEx knows which one it asked for. Since
    // we're that caller for a remote Restart command, report RESTART here,
    // before dispatching the blocking call below, rather than letting
    // power_watcher.rs report the generic SHUTDOWN it would otherwise see.
    if request.command_type == CommandType::Restart {
        SocketClient::report_event(&client, ReportedEvent::new(EventType::Restart), &force_reconnect).await;
    }

    // Win32 calls in executor::execute are blocking (process creation,
    // token duplication) - run them off the async runtime's worker
    // threads so a slow command can't stall event watchers or the
    // connection's own message pump.
    let command_type = request.command_type;
    let result = tokio::task::spawn_blocking(move || executor::execute(command_type))
        .await
        .unwrap_or_else(|e| Err(format!("Command execution task panicked: {e}")));

    let ack_payload = match &result {
        Ok(()) => serde_json::json!({ "commandId": request.command_id, "success": true }),
        Err(e) => serde_json::json!({ "commandId": request.command_id, "success": false, "error": e }),
    };

    if let Err(e) = result {
        error!("Command {:?} failed: {e}", request.command_type);
    } else {
        info!("Command {:?} executed successfully", request.command_type);
    }

    if let Err(e) = client.emit("command:ack", ack_payload).await {
        error!("Failed to send command:ack: {e}");
        force_reconnect.notify_one();
    }
}

/// Handles an incoming process:list:request from the server, replying with
/// process:list:response. Same plain-event-plus-reply shape as commands,
/// for the same reason: this crate can't respond to a server-initiated ack.
async fn handle_process_list_request(payload: Payload, client: Client, force_reconnect: Arc<Notify>) {
    let Payload::Text(values) = payload else {
        error!("process:list:request payload was not the expected Text variant");
        return;
    };

    let Some(first) = values.first() else {
        error!("process:list:request payload was empty");
        return;
    };

    let request: ProcessListRequest = match serde_json::from_value(first.clone()) {
        Ok(r) => r,
        Err(e) => {
            error!("Failed to parse process:list:request payload: {e}");
            return;
        }
    };

    info!("Listing processes (request id: {})", request.request_id);

    // Enumerating processes and sampling CPU% blocks the thread for the
    // sample interval - keep it off the async runtime's worker threads.
    let processes = tokio::task::spawn_blocking(processes::list_processes)
        .await
        .unwrap_or_else(|e| {
            error!("Process listing task panicked: {e}");
            Vec::new()
        });

    let response_payload = serde_json::json!({
        "requestId": request.request_id,
        "processes": processes,
    });

    if let Err(e) = client.emit("process:list:response", response_payload).await {
        error!("Failed to send process:list:response: {e}");
        force_reconnect.notify_one();
    }
}

/// Handles an incoming metrics:request from the server, replying with
/// metrics:response. Same plain-event-plus-reply shape as commands and
/// processes, for the same reason: this crate can't respond to a
/// server-initiated ack.
async fn handle_metrics_request(payload: Payload, client: Client, force_reconnect: Arc<Notify>) {
    let Payload::Text(values) = payload else {
        error!("metrics:request payload was not the expected Text variant");
        return;
    };

    let Some(first) = values.first() else {
        error!("metrics:request payload was empty");
        return;
    };

    let request: MetricsRequest = match serde_json::from_value(first.clone()) {
        Ok(r) => r,
        Err(e) => {
            error!("Failed to parse metrics:request payload: {e}");
            return;
        }
    };

    info!("Collecting system metrics (request id: {})", request.request_id);

    // CPU%/network sampling blocks the thread for SAMPLE_INTERVAL, and the
    // ping is a blocking Win32 call with its own timeout - keep all of it
    // off the async runtime's worker threads.
    let metrics = tokio::task::spawn_blocking(metrics::collect_metrics).await.ok();

    let Some(metrics) = metrics else {
        error!("Metrics collection task panicked");
        return;
    };

    let response_payload = serde_json::json!({
        "requestId": request.request_id,
        "metrics": metrics,
    });

    if let Err(e) = client.emit("metrics:response", response_payload).await {
        error!("Failed to send metrics:response: {e}");
        force_reconnect.notify_one();
    }
}

/// Handles an incoming files:list:request, replying with either
/// files:list:response (success) or files:list:error (any failure,
/// including a rejected path) - the server needs a definite completion of
/// the pending request either way, or it would sit until the timeout fires.
async fn handle_files_list_request(payload: Payload, client: Client, browse_root: PathBuf, force_reconnect: Arc<Notify>) {
    let Payload::Text(values) = payload else {
        error!("files:list:request payload was not the expected Text variant");
        return;
    };

    let Some(first) = values.first() else {
        error!("files:list:request payload was empty");
        return;
    };

    let request: FileListRequest = match serde_json::from_value(first.clone()) {
        Ok(r) => r,
        Err(e) => {
            error!("Failed to parse files:list:request payload: {e}");
            return;
        }
    };

    info!("Listing directory '{}' (request id: {})", request.path, request.request_id);

    let path = request.path.clone();
    let result = tokio::task::spawn_blocking(move || files::list_directory(&browse_root, &path))
        .await
        .unwrap_or_else(|e| Err(format!("Directory listing task panicked: {e}")));

    match result {
        Ok(entries) => {
            let payload = serde_json::json!({ "requestId": request.request_id, "entries": entries });
            if let Err(e) = client.emit("files:list:response", payload).await {
                error!("Failed to send files:list:response: {e}");
                force_reconnect.notify_one();
            }
        }
        Err(message) => {
            error!("Directory listing failed for '{}': {message}", request.path);
            let payload = serde_json::json!({ "requestId": request.request_id, "error": message });
            if let Err(e) = client.emit("files:list:error", payload).await {
                error!("Failed to send files:list:error: {e}");
                force_reconnect.notify_one();
            }
        }
    }
}

const DOWNLOAD_CHUNK_SIZE: usize = 64 * 1024;

/// Handles an incoming files:download:request by streaming the file back
/// as a sequence of files:download:chunk binary events, followed by
/// exactly one files:download:complete or files:download:error. Reading is
/// done on a blocking thread and handed to this async task over a bounded
/// channel, so a slow network send applies backpressure to the file reads
/// instead of the whole file being buffered in memory up front.
async fn handle_files_download_request(
    payload: Payload,
    client: Client,
    browse_root: PathBuf,
    force_reconnect: Arc<Notify>,
) {
    let Payload::Text(values) = payload else {
        error!("files:download:request payload was not the expected Text variant");
        return;
    };

    let Some(first) = values.first() else {
        error!("files:download:request payload was empty");
        return;
    };

    let request: FileDownloadRequest = match serde_json::from_value(first.clone()) {
        Ok(r) => r,
        Err(e) => {
            error!("Failed to parse files:download:request payload: {e}");
            return;
        }
    };

    info!("Starting download of '{}' (request id: {})", request.path, request.request_id);

    let resolved = {
        let browse_root = browse_root.clone();
        let path = request.path.clone();
        tokio::task::spawn_blocking(move || files::resolve_and_open_download(&browse_root, &path)).await
    };

    let mut file = match resolved.unwrap_or_else(|e| Err(format!("Path resolution task panicked: {e}"))) {
        Ok(file) => file,
        Err(message) => {
            error!("Download rejected for '{}': {message}", request.path);
            send_download_error(&client, &request.request_id, &message, &force_reconnect).await;
            return;
        }
    };

    let (tx, mut rx) = tokio::sync::mpsc::channel::<Result<Vec<u8>, String>>(4);

    tokio::task::spawn_blocking(move || {
        use std::io::Read;

        let mut buffer = vec![0u8; DOWNLOAD_CHUNK_SIZE];
        loop {
            match file.read(&mut buffer) {
                Ok(0) => break,
                Ok(n) => {
                    if tx.blocking_send(Ok(buffer[..n].to_vec())).is_err() {
                        // Receiver dropped - the async side already gave up
                        // (e.g. the socket died), no point reading further.
                        break;
                    }
                }
                Err(e) => {
                    let _ = tx.blocking_send(Err(format!("Read error: {e}")));
                    break;
                }
            }
        }
    });

    while let Some(chunk) = rx.recv().await {
        match chunk {
            Ok(bytes) => {
                // emit() can only carry a single Payload, and Payload has
                // no variant mixing text with binary - the requestId is
                // prefixed onto the binary chunk itself instead (a UUID's
                // string form is always exactly 36 ASCII bytes, so the
                // server can slice a fixed-width prefix back off).
                let mut framed = Vec::with_capacity(36 + bytes.len());
                framed.extend_from_slice(request.request_id.as_bytes());
                framed.extend_from_slice(&bytes);

                if let Err(e) = client.emit("files:download:chunk", framed).await {
                    error!("Failed to send files:download:chunk: {e}");
                    force_reconnect.notify_one();
                    return;
                }
            }
            Err(message) => {
                error!("Download failed for '{}': {message}", request.path);
                send_download_error(&client, &request.request_id, &message, &force_reconnect).await;
                return;
            }
        }
    }

    let payload = serde_json::json!({ "requestId": request.request_id });
    if let Err(e) = client.emit("files:download:complete", payload).await {
        error!("Failed to send files:download:complete: {e}");
        force_reconnect.notify_one();
    }
}

async fn send_download_error(client: &Client, request_id: &str, message: &str, force_reconnect: &Notify) {
    let payload = serde_json::json!({ "requestId": request_id, "error": message });
    if let Err(e) = client.emit("files:download:error", payload).await {
        error!("Failed to send files:download:error: {e}");
        force_reconnect.notify_one();
    }
}

/// Handles an incoming screenshot:request by capturing the full virtual
/// screen (via the per-session helper, since this service has no
/// interactive desktop of its own - see screenshot/mod.rs) and replying
/// with either a binary screenshot:response or a screenshot:error. A single
/// capture is small enough (typically a few hundred KB to a few MB PNG)
/// that, unlike file downloads, it doesn't need chunked streaming - one
/// binary emit, requestId-prefixed the same way download chunks are.
async fn handle_screenshot_request(payload: Payload, client: Client, force_reconnect: Arc<Notify>) {
    let Payload::Text(values) = payload else {
        error!("screenshot:request payload was not the expected Text variant");
        return;
    };

    let Some(first) = values.first() else {
        error!("screenshot:request payload was empty");
        return;
    };

    let request: ScreenshotRequest = match serde_json::from_value(first.clone()) {
        Ok(r) => r,
        Err(e) => {
            error!("Failed to parse screenshot:request payload: {e}");
            return;
        }
    };

    info!("Capturing screenshot (request id: {})", request.request_id);

    // GDI capture happens in the helper process (over the named pipe), but
    // the pipe I/O this side does to reach it is itself blocking - keep it
    // off the async runtime's worker threads like every other Win32/blocking
    // call in this file.
    let result = tokio::task::spawn_blocking(screenshot::capture_screenshot)
        .await
        .unwrap_or_else(|e| Err(format!("Screenshot capture task panicked: {e}")));

    match result {
        Ok(png_bytes) => {
            let mut framed = Vec::with_capacity(36 + png_bytes.len());
            framed.extend_from_slice(request.request_id.as_bytes());
            framed.extend_from_slice(&png_bytes);

            if let Err(e) = client.emit("screenshot:response", framed).await {
                error!("Failed to send screenshot:response: {e}");
                force_reconnect.notify_one();
            }
        }
        Err(message) => {
            error!("Screenshot capture failed: {message}");
            let error_payload = serde_json::json!({ "requestId": request.request_id, "error": message });
            if let Err(e) = client.emit("screenshot:error", error_payload).await {
                error!("Failed to send screenshot:error: {e}");
                force_reconnect.notify_one();
            }
        }
    }
}
