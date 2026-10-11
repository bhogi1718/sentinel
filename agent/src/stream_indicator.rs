// A small always-on-top banner the per-session helper shows while a live
// view is active, so anyone physically at the laptop can tell the screen is
// being watched. This is the key "you can see when you're being viewed"
// affordance for the live-view feature - it deliberately cannot be
// suppressed by the viewing side.
//
// Mechanics: the helper handles screen captures as independent pipe
// requests and has no long-lived notion of a "session", so instead of
// being told start/stop, this module is pinged (notify_active) on every
// StreamFrame request and shows the banner whenever frames have been asked
// for recently (within ACTIVE_WINDOW). A dedicated thread owns the window
// and its message loop (a Win32 window must be serviced on the thread that
// created it); a 500ms timer polls the last-active timestamp and shows or
// hides the banner accordingly.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use windows::core::w;
use windows::Win32::Foundation::{COLORREF, HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{
    BeginPaint, CreateSolidBrush, DrawTextW, EndPaint, FillRect, SetBkMode, SetTextColor, DT_CENTER, DT_SINGLELINE,
    DT_VCENTER, PAINTSTRUCT, TRANSPARENT,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, GetClientRect, GetMessageW, GetSystemMetrics, RegisterClassW,
    SetLayeredWindowAttributes, SetTimer, SetWindowPos, ShowWindow, TranslateMessage, HWND_TOPMOST, LWA_ALPHA,
    MSG, SM_CXSCREEN, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SW_HIDE, SW_SHOWNA, WM_PAINT, WM_TIMER, WNDCLASSW,
    WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_EX_TRANSPARENT, WS_POPUP,
};

/// Unix-epoch milliseconds of the most recent frame request. 0 means never.
static LAST_ACTIVE_MS: AtomicU64 = AtomicU64::new(0);

/// How long after the last frame request the banner stays up. Comfortably
/// longer than the stream's frame interval (~500ms) so normal frame-to-
/// frame gaps never flicker it, but short enough that it disappears within
/// a few seconds of a stream actually stopping.
const ACTIVE_WINDOW_MS: u64 = 2500;

const BANNER_WIDTH: i32 = 300;
const BANNER_HEIGHT: i32 = 40;
const BANNER_TOP_MARGIN: i32 = 12;

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Called on every incoming stream frame request. Cheap and lock-free.
pub fn notify_active() {
    LAST_ACTIVE_MS.store(now_ms(), Ordering::Relaxed);
}

fn is_active() -> bool {
    let last = LAST_ACTIVE_MS.load(Ordering::Relaxed);
    last != 0 && now_ms().saturating_sub(last) < ACTIVE_WINDOW_MS
}

/// Spawns the indicator thread. Safe to call once at helper startup; if the
/// window can't be created the thread just exits quietly (the stream still
/// works, only the on-screen indicator is absent - logged by the caller).
pub fn spawn() {
    std::thread::spawn(|| unsafe {
        if let Err(e) = run() {
            tracing::warn!("Live-view indicator window unavailable: {e}");
        }
    });
}

unsafe fn run() -> Result<(), String> {
    let instance = GetModuleHandleW(None).map_err(|e| format!("GetModuleHandleW failed: {e}"))?;

    let class_name = w!("SentinelStreamIndicator");
    let wnd_class = WNDCLASSW {
        lpfnWndProc: Some(wnd_proc),
        hInstance: instance.into(),
        lpszClassName: class_name,
        ..Default::default()
    };

    // A zero return means the class failed to register (and it isn't the
    // "already registered" case on first run).
    if RegisterClassW(&wnd_class) == 0 {
        return Err("RegisterClassW failed".to_string());
    }

    let screen_width = GetSystemMetrics(SM_CXSCREEN);
    let x = ((screen_width - BANNER_WIDTH) / 2).max(0);

    let hwnd = CreateWindowExW(
        WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_LAYERED | WS_EX_TRANSPARENT,
        class_name,
        w!("Sentinel"),
        WS_POPUP,
        x,
        BANNER_TOP_MARGIN,
        BANNER_WIDTH,
        BANNER_HEIGHT,
        None,
        None,
        instance,
        None,
    )
    .map_err(|e| format!("CreateWindowExW failed: {e}"))?;

    // ~92% opaque - clearly visible but not a harsh solid block.
    let _ = SetLayeredWindowAttributes(hwnd, COLORREF(0), 235, LWA_ALPHA);

    // Poll show/hide every 500ms (timer id 1).
    SetTimer(hwnd, 1, 500, None);

    let mut msg = MSG::default();
    while GetMessageW(&mut msg, None, 0, 0).as_bool() {
        let _ = TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }

    Ok(())
}

extern "system" fn wnd_proc(hwnd: HWND, message: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    unsafe {
        match message {
            WM_TIMER => {
                if is_active() {
                    // Re-assert topmost each tick so a newly-opened app
                    // window can't end up covering the banner.
                    let _ = SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
                    let _ = ShowWindow(hwnd, SW_SHOWNA);
                } else {
                    let _ = ShowWindow(hwnd, SW_HIDE);
                }
                LRESULT(0)
            }
            WM_PAINT => {
                let mut ps = PAINTSTRUCT::default();
                let hdc = BeginPaint(hwnd, &mut ps);

                let mut rect = RECT::default();
                let _ = GetClientRect(hwnd, &mut rect);

                // Red background.
                let brush = CreateSolidBrush(COLORREF(0x0000C8)); // BGR: strong red
                FillRect(hdc, &rect, brush);

                SetBkMode(hdc, TRANSPARENT);
                SetTextColor(hdc, COLORREF(0x00FFFFFF)); // white

                let mut text: Vec<u16> = "\u{25CF}  This screen is being viewed remotely".encode_utf16().collect();
                DrawTextW(hdc, &mut text, &mut rect, DT_CENTER | DT_VCENTER | DT_SINGLELINE);

                let _ = EndPaint(hwnd, &ps);
                LRESULT(0)
            }
            _ => DefWindowProcW(hwnd, message, wparam, lparam),
        }
    }
}
