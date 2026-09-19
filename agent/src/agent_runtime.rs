use std::path::Path;
use chrono::{DateTime, Utc};
use tokio::sync::watch;
use tokio_util::sync::CancellationToken;
use tracing::{error, info, warn};
use windows::Win32::System::SystemInformation::GetTickCount64;

use crate::config::Config;
use crate::events;
use crate::events::types::{EventType, ReportedEvent};
use crate::socket_client::{ConnectedClient, SocketClient};

/// Windows tracks milliseconds elapsed since boot (GetTickCount64), not a
/// boot timestamp directly - subtracting that duration from "now" recovers
/// the actual boot time. This only needs to be accurate to the second,
/// which GetTickCount64 comfortably is. GetTickCount64 keeps counting
/// through sleep/wake, so this value only changes on a genuine power-on
/// reboot, never on a sleep cycle or an agent/service restart.
fn system_boot_time() -> DateTime<Utc> {
    let uptime_ms = unsafe { GetTickCount64() };
    Utc::now() - chrono::Duration::milliseconds(uptime_ms as i64)
}

/// Path to the small marker file used to detect a genuine reboot across
/// agent/service restarts. Placed next to the executable, same convention
/// as the log files and agent.toml (services have no defined working
/// directory to rely on instead).
fn last_boot_marker_path() -> std::path::PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.join("last_boot.txt")))
        .unwrap_or_else(|| std::path::PathBuf::from("last_boot.txt"))
}

/// Reports BOOT only the first time this specific boot has been seen -
/// otherwise every agent restart (sleep/wake, service restart, a crash
/// recovery) would report a fresh BOOT event even though the machine
/// never actually powered off, since "first connection since the agent
/// process started" and "the machine just booted" are not the same thing.
/// The marker file makes "have I already reported this boot" durable
/// across agent restarts, not just within one process's lifetime.
fn is_new_boot(boot_time: DateTime<Utc>) -> bool {
    let marker_path = last_boot_marker_path();
    let current = boot_time.to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    let previous = std::fs::read_to_string(&marker_path).ok();
    let is_new = previous.as_deref().map(str::trim) != Some(current.as_str());

    if is_new {
        if let Err(e) = std::fs::write(&marker_path, &current) {
            warn!("Failed to persist boot marker to {}: {e}", marker_path.display());
        }
    }

    is_new
}

/// Owns the connection lifecycle: connects, publishes the live client to
/// every watcher via the watch channel, and reconnects when notified of a
/// disconnect. Watchers never talk to the raw socket directly - they read
/// whatever is currently published here, so a drop/reconnect is
/// transparent to them. Exits promptly once `shutdown` is cancelled.
async fn run_connection_manager(
    socket_client: SocketClient,
    client_tx: watch::Sender<Option<ConnectedClient>>,
    shutdown: CancellationToken,
) {
    let mut first_connection = true;

    loop {
        let (client, disconnected, force_reconnect) = tokio::select! {
            result = socket_client.connect() => result,
            _ = shutdown.cancelled() => return,
        };

        if first_connection {
            first_connection = false;
            let boot_time = system_boot_time();
            if is_new_boot(boot_time) {
                let event = ReportedEvent::new(EventType::Boot).occurred_at(boot_time);
                SocketClient::report_event(&client, event, &force_reconnect).await;
            } else {
                info!("Agent (re)started but the machine has not actually rebooted - skipping BOOT event");
            }
        }

        let _ = client_tx.send(Some((client, force_reconnect.clone())));

        // Either the crate's own disconnect callback fires (server-initiated
        // close, read-side detected failure), or a handler that failed to
        // emit() proactively signals force_reconnect - see connect()'s doc
        // comment for why the latter is necessary at all: a write failure
        // alone never trips the crate's own disconnect detection.
        tokio::select! {
            _ = disconnected => {}
            _ = force_reconnect.notified() => {
                warn!("Forcing reconnect after a failed emit");
            }
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
    let socket_client = SocketClient::new(
        config.server_url.clone(),
        config.device_token.clone(),
        std::path::PathBuf::from(&config.browse_root),
    );

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
