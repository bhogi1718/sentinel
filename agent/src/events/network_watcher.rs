use rust_socketio::asynchronous::Client;
use std::time::Duration;
use tokio::sync::watch;
use tokio_util::sync::CancellationToken;
use tracing::info;
use windows::Win32::Networking::WinInet::{InternetGetConnectedState, INTERNET_CONNECTION};

use super::types::{EventType, ReportedEvent};
use crate::socket_client::SocketClient;

fn is_connected() -> bool {
    let mut flags = INTERNET_CONNECTION::default();
    unsafe { InternetGetConnectedState(&mut flags, 0) }.is_ok()
}

/// Polls connectivity on an interval and reports a transition event only
/// when the state actually changes, not on every poll. Exits promptly once
/// `shutdown` is cancelled.
pub async fn run(client_rx: watch::Receiver<Option<Client>>, check_interval: Duration, shutdown: CancellationToken) {
    let mut last_state = is_connected();
    info!("Network watcher started (initial state: connected={last_state})");

    let mut interval = tokio::time::interval(check_interval);
    loop {
        tokio::select! {
            _ = interval.tick() => {}
            _ = shutdown.cancelled() => return,
        }

        let current = is_connected();

        if current != last_state {
            last_state = current;
            let event_type = if current {
                EventType::InternetConnected
            } else {
                EventType::InternetDisconnected
            };

            let client = client_rx.borrow().clone();
            if let Some(client) = client {
                SocketClient::report_event(&client, ReportedEvent::new(event_type)).await;
            }
        }
    }
}
