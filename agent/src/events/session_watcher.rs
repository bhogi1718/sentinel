use rust_socketio::asynchronous::Client;
use tokio::sync::{mpsc, watch};
use tokio_util::sync::CancellationToken;
use tracing::info;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::RemoteDesktop::{
    WTSGetActiveConsoleSessionId, WTSRegisterSessionNotification, WTSUnRegisterSessionNotification,
    NOTIFY_FOR_ALL_SESSIONS,
};
use windows::Win32::UI::WindowsAndMessaging::{
    DefWindowProcW, DispatchMessageW, GetMessageW, PostQuitMessage, TranslateMessage, MSG,
    WM_DESTROY, WM_WTSSESSION_CHANGE, WTS_SESSION_LOCK, WTS_SESSION_UNLOCK,
};

use super::types::{EventType, ReportedEvent};
use super::win_message_window::MessageOnlyWindow;
use crate::socket_client::SocketClient;

/// Local mirror of the WM_WTSSESSION_CHANGE reason codes we care about,
/// decoupled from the raw window-proc callback so the async side doesn't
/// need to touch Win32 types directly.
enum SessionEvent {
    Locked,
    Unlocked,
}

thread_local! {
    static EVENT_TX: std::cell::RefCell<Option<mpsc::UnboundedSender<SessionEvent>>> = const { std::cell::RefCell::new(None) };
}

unsafe extern "system" fn window_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if msg == WM_WTSSESSION_CHANGE {
        // With NOTIFY_FOR_ALL_SESSIONS, lparam carries the session ID the
        // notification came from - only the active console session is the
        // real interactive user, so anything else (e.g. Session 0 itself)
        // is filtered out here rather than trusted implicitly.
        let session_id = lparam.0 as u32;
        if session_id == WTSGetActiveConsoleSessionId() {
            let reason = wparam.0 as u32;
            let event = match reason {
                WTS_SESSION_LOCK => Some(SessionEvent::Locked),
                WTS_SESSION_UNLOCK => Some(SessionEvent::Unlocked),
                _ => None,
            };

            if let Some(event) = event {
                EVENT_TX.with(|tx| {
                    if let Some(tx) = tx.borrow().as_ref() {
                        let _ = tx.send(event);
                    }
                });
            }
        }
        return LRESULT(0);
    }

    if msg == WM_DESTROY {
        PostQuitMessage(0);
        return LRESULT(0);
    }

    DefWindowProcW(hwnd, msg, wparam, lparam)
}

/// Runs the blocking Win32 message loop on a dedicated OS thread (required:
/// session notifications only arrive on the thread that registered for
/// them), forwarding decoded events to the async watcher via a channel.
fn spawn_message_loop() -> mpsc::UnboundedReceiver<SessionEvent> {
    let (tx, rx) = mpsc::unbounded_channel();

    std::thread::spawn(move || {
        EVENT_TX.with(|cell| *cell.borrow_mut() = Some(tx));

        let window = match MessageOnlyWindow::create("SentinelSessionWatcher", Some(window_proc)) {
            Ok(w) => w,
            Err(e) => {
                tracing::error!("Failed to create session watcher window: {e}");
                return;
            }
        };

        // NOTIFY_FOR_THIS_SESSION would register for the *calling process's*
        // session - Session 0 for a LocalSystem service, which never has an
        // interactive user and so never locks/unlocks. NOTIFY_FOR_ALL_SESSIONS
        // is required to see session-change notifications from the actual
        // interactive session (Session 1+).
        unsafe {
            let _ = WTSRegisterSessionNotification(window.hwnd(), NOTIFY_FOR_ALL_SESSIONS);
        }

        let mut msg = MSG::default();
        unsafe {
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
            let _ = WTSUnRegisterSessionNotification(window.hwnd());
        }
    });

    rx
}

/// The underlying OS thread's Win32 message loop is a daemon: it isn't
/// explicitly torn down on shutdown, since the whole process exits shortly
/// after a Windows Service stop request anyway and it holds no resources
/// that need graceful cleanup beyond that.
pub async fn run(client_rx: watch::Receiver<Option<Client>>, shutdown: CancellationToken) {
    let mut rx = spawn_message_loop();
    info!("Session watcher started");

    loop {
        let event = tokio::select! {
            event = rx.recv() => match event {
                Some(event) => event,
                None => return,
            },
            _ = shutdown.cancelled() => return,
        };

        let event_type = match event {
            SessionEvent::Locked => EventType::Lock,
            SessionEvent::Unlocked => EventType::Unlock,
        };

        let client = client_rx.borrow().clone();
        if let Some(client) = client {
            SocketClient::report_event(&client, ReportedEvent::new(event_type)).await;
        }
    }
}
