use std::collections::HashMap;
use std::time::Duration;
use tokio::sync::watch;
use tokio_util::sync::CancellationToken;
use tracing::info;
use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};

use super::types::{EventType, ReportedEvent};
use crate::socket_client::{ConnectedClient, SocketClient};

const POLL_INTERVAL: Duration = Duration::from_secs(60);

/// Battery percentage as reported by Windows, or None if no battery is
/// present (desktop PCs, or the value is unavailable). Shared with the
/// metrics module so both use the same Win32 call rather than duplicating
/// it - GetSystemPowerStatus is cheap, but there's no reason for two
/// separate implementations of the same 255-sentinel-means-absent logic.
pub(crate) fn battery_percent() -> Option<u8> {
    let mut status = SYSTEM_POWER_STATUS::default();
    let ok = unsafe { GetSystemPowerStatus(&mut status) }.is_ok();

    if !ok || status.BatteryLifePercent == 255 {
        return None;
    }

    Some(status.BatteryLifePercent)
}

/// Polls battery level and reports BATTERY_LOW exactly once per crossing
/// below the threshold - re-arms once the level recovers above it, so a
/// laptop hovering right at the threshold doesn't spam repeated events.
/// Exits promptly once `shutdown` is cancelled.
pub async fn run(client_rx: watch::Receiver<Option<ConnectedClient>>, threshold: u8, shutdown: CancellationToken) {
    let mut was_below_threshold = false;
    info!("Battery watcher started (threshold: {threshold}%)");

    let mut interval = tokio::time::interval(POLL_INTERVAL);
    loop {
        tokio::select! {
            _ = interval.tick() => {}
            _ = shutdown.cancelled() => return,
        }

        let Some(percent) = battery_percent() else {
            continue;
        };

        let is_below = percent <= threshold;

        if is_below && !was_below_threshold {
            was_below_threshold = true;

            let mut metadata = HashMap::new();
            metadata.insert("batteryPercent".to_string(), serde_json::json!(percent));

            let connected_client = client_rx.borrow().clone();
            if let Some((client, force_reconnect)) = connected_client {
                SocketClient::report_event(
                    &client,
                    ReportedEvent::with_metadata(EventType::BatteryLow, metadata),
                    &force_reconnect,
                )
                .await;
            }
        } else if !is_below {
            was_below_threshold = false;
        }
    }
}
