use std::path::Path;
use chrono::{DateTime, Utc};
use tokio::sync::watch;
use tokio_util::sync::CancellationToken;
use tracing::{error, info};
use windows::Win32::System::SystemInformation::GetTickCount64;

use crate::config::Config;
use crate::events;
use crate::events::types::{EventType, ReportedEvent};
use crate::socket_client::SocketClient;

/// Windows tracks milliseconds elapsed since boot (GetTickCount64), not a
/// boot timestamp directly - subtracting that duration from "now" recovers
/// the actual boot time. This only needs to be accurate to the second,
/// which GetTickCount64 comfortably is.
fn system_boot_time() -> DateTime<Utc> {
    let uptime_ms = unsafe { GetTickCount64() };
    Utc::now() - chrono::Duration::milliseconds(uptime_ms as i64)
}

/// Owns the connection lifecycle: connects, publishes the live client to
/// every watcher via the watch channel, and reconnects when notified of a
/// disconnect. Watchers never talk to the raw socket directly - they read
/// whatever is currently published here, so a drop/reconnect is
/// transparent to them. Exits promptly once `shutdown` is cancelled.
async fn run_connection_manager(
    socket_client: SocketClient,
    client_tx: watch::Sender<Option<rust_socketio::asynchronous::Client>>,
    shutdown: CancellationToken,
) {
    let mut first_connection = true;

    loop {
        let (client, disconnected) = tokio::select! {
            result = socket_client.connect() => result,
            _ = shutdown.cancelled() => return,
        };

        if first_connection {
            first_connection = false;
            let event = ReportedEvent::new(EventType::Boot).occurred_at(system_boot_time());
            SocketClient::report_event(&client, event).await;
        }

        let _ = client_tx.send(Some(client));

        tokio::select! {
            _ = disconnected => {}
            _ = shutdown.cancelled() => return,
        }

        let _ = client_tx.send(None);
        error!("Connection lost, reconnecting...");
    }
}

/// Loads config and runs every watcher until `shutdown` is cancelled. This
/// is the single implementation shared by both console mode (main.rs,
/// cancelled on Ctrl+C) and Windows Service mode (service.rs, cancelled on
/// a SERVICE_CONTROL_STOP request from the SCM) - the two entrypoints only
/// differ in how they're launched and how they signal shutdown, never in
/// what the agent actually does while running.
pub async fn run(config_path: &Path, shutdown: CancellationToken) {
    let config = match Config::load(config_path) {
        Ok(c) => c,
        Err(e) => {
            error!("Failed to load config: {e}");
            return;
        }
    };

    info!("Sentinel Agent starting, connecting to {}", config.server_url);

    let (client_tx, client_rx) = watch::channel(None);
    let socket_client = SocketClient::new(config.server_url.clone(), config.device_token.clone());

    let connection_task = tokio::spawn(run_connection_manager(socket_client, client_tx, shutdown.clone()));

    let network_task = tokio::spawn(events::network_watcher::run(
        client_rx.clone(),
        std::time::Duration::from_secs(config.network_check_interval_secs),
        shutdown.clone(),
    ));
    let battery_task = tokio::spawn(events::battery_watcher::run(
        client_rx.clone(),
        config.battery_low_threshold,
        shutdown.clone(),
    ));
    let session_task = tokio::spawn(events::session_watcher::run(client_rx.clone(), shutdown.clone()));
    let power_task = tokio::spawn(events::power_watcher::run(client_rx.clone(), shutdown.clone()));

    let _ = tokio::join!(connection_task, network_task, battery_task, session_task, power_task);
    info!("Sentinel Agent shut down cleanly");
}
