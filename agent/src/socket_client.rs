use rust_socketio::asynchronous::{Client, ClientBuilder};
use rust_socketio::Payload;
use std::time::Duration;
use tokio::sync::oneshot;
use tracing::{error, info, warn};

use crate::commands::executor;
use crate::commands::CommandRequest;
use crate::events::types::ReportedEvent;

const RECONNECT_DELAY: Duration = Duration::from_secs(5);

pub struct SocketClient {
    server_url: String,
    device_token: String,
}

impl SocketClient {
    pub fn new(server_url: String, device_token: String) -> Self {
        Self {
            server_url,
            device_token,
        }
    }

    /// Connects to the /agent namespace, retrying indefinitely with a fixed
    /// delay on failure. Returns the connected client plus a receiver that
    /// resolves the moment the server-side "disconnect" event fires, so the
    /// caller knows exactly when to reconnect instead of polling.
    ///
    /// Crucially, this does not return until the namespace-level "connect"
    /// event has actually fired. `ClientBuilder::connect()` resolving only
    /// means the namespace CONNECT packet was *sent* - the server's ack that
    /// the socket has actually joined the namespace arrives asynchronously
    /// afterward. Emitting before that ack completes gets silently dropped
    /// server-side, since the socket isn't considered part of the namespace
    /// yet.
    pub async fn connect(&self) -> (Client, oneshot::Receiver<()>) {
        loop {
            let auth = serde_json::json!({ "token": self.device_token });
            let (disconnect_tx, disconnect_rx) = oneshot::channel::<()>();
            let disconnect_tx = std::sync::Arc::new(std::sync::Mutex::new(Some(disconnect_tx)));
            let (ready_tx, ready_rx) = oneshot::channel::<()>();
            let ready_tx = std::sync::Arc::new(std::sync::Mutex::new(Some(ready_tx)));

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
                .on("command:execute", |payload, client| {
                    Box::pin(async move {
                        handle_command(payload, client).await;
                    })
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
                            return (client, disconnect_rx);
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
    pub async fn report_event(client: &Client, event: ReportedEvent) {
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
async fn handle_command(payload: Payload, client: Client) {
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
    }
}
