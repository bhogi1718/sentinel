use rust_socketio::asynchronous::Client;
use tokio::sync::{mpsc, watch};
use tokio_util::sync::CancellationToken;
use tracing::info;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::WindowsAndMessaging::{
    DefWindowProcW, DispatchMessageW, GetMessageW, PostQuitMessage, TranslateMessage, MSG,
    PBT_APMRESUMEAUTOMATIC, PBT_APMSUSPEND, WM_DESTROY, WM_POWERBROADCAST, WM_QUERYENDSESSION,
};

use super::types::{EventType, ReportedEvent};
use super::win_message_window::MessageOnlyWindow;
use crate::socket_client::SocketClient;

enum PowerEvent {
    Sleep,
    Wake,
    Shutdown,
}

thread_local! {
    static EVENT_TX: std::cell::RefCell<Option<mpsc::UnboundedSender<PowerEvent>>> = const { std::cell::RefCell::new(None) };
}

unsafe extern "system" fn window_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    let event = match msg {
        WM_POWERBROADCAST => match wparam.0 as u32 {
            PBT_APMSUSPEND => Some(PowerEvent::Sleep),
            PBT_APMRESUMEAUTOMATIC => Some(PowerEvent::Wake),
            _ => None,
        },
        // WM_QUERYENDSESSION fires on shutdown/restart/logoff before the
        // system actually goes down - the closest reliable hook available
        // to a background process for reporting an imminent shutdown.
        WM_QUERYENDSESSION => Some(PowerEvent::Shutdown),
        _ => None,
    };

    if let Some(event) = event {
        EVENT_TX.with(|tx| {
            if let Some(tx) = tx.borrow().as_ref() {
                let _ = tx.send(event);
            }
        });
    }

    if msg == WM_DESTROY {
        PostQuitMessage(0);
        return LRESULT(0);
    }

    DefWindowProcW(hwnd, msg, wparam, lparam)
}

fn spawn_message_loop() -> mpsc::UnboundedReceiver<PowerEvent> {
    let (tx, rx) = mpsc::unbounded_channel();

    std::thread::spawn(move || {
        EVENT_TX.with(|cell| *cell.borrow_mut() = Some(tx));

        let window = match MessageOnlyWindow::create("SentinelPowerWatcher", Some(window_proc)) {
            Ok(w) => w,
            Err(e) => {
                tracing::error!("Failed to create power watcher window: {e}");
                return;
            }
        };
        let _ = window;

        let mut msg = MSG::default();
        unsafe {
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
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
    info!("Power watcher started");

    loop {
        let event = tokio::select! {
            event = rx.recv() => match event {
                Some(event) => event,
                None => return,
            },
            _ = shutdown.cancelled() => return,
        };

        let event_type = match event {
            PowerEvent::Sleep => EventType::Sleep,
            PowerEvent::Wake => EventType::Wake,
            PowerEvent::Shutdown => EventType::Shutdown,
        };

        let client = client_rx.borrow().clone();
        if let Some(client) = client {
            SocketClient::report_event(&client, ReportedEvent::new(event_type)).await;
        }
    }
}
