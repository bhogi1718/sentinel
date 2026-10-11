// A transparent, click-through overlay the per-session helper draws on the
// laptop's own screen so annotations made by a remote viewer are visible to
// whoever is physically at the machine - the "shared annotation" half of
// the live view, like the pointer/pen overlay in a screen-share call.
//
// This is DISPLAY ONLY. The overlay has WS_EX_TRANSPARENT (mouse clicks
// pass straight through it to the real windows underneath) and never calls
// any input API - it cannot click, type, or otherwise control the machine.
// It only paints shapes it is told to paint, and auto-clears itself if no
// update arrives for a while.
//
// Same threading model as stream_indicator: one dedicated thread owns the
// window and its message loop. The pipe handler updates a shared shape list
// and pokes the window to repaint.

use std::sync::atomic::{AtomicIsize, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use windows::core::w;
use windows::Win32::Foundation::{COLORREF, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{
    BeginPaint, CreatePen, CreateSolidBrush, DeleteObject, EndPaint, FillRect, GetStockObject, InvalidateRect, LineTo,
    MoveToEx, Polyline, Rectangle, SelectObject, HOLLOW_BRUSH, HPEN, PAINTSTRUCT, PS_SOLID,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, GetSystemMetrics, RegisterClassW,
    SetLayeredWindowAttributes, SetTimer, SetWindowPos, ShowWindow, TranslateMessage, HWND_TOPMOST, LWA_COLORKEY, MSG,
    SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
    SW_HIDE, SW_SHOWNA, WM_PAINT, WM_TIMER, WNDCLASSW, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST,
    WS_EX_TRANSPARENT, WS_POPUP,
};

use crate::helper_ipc::WireShape;

/// Shapes currently shown, in normalized (0..1) screen coordinates.
static SHAPES: Mutex<Vec<WireShape>> = Mutex::new(Vec::new());
/// Overlay window handle (as isize) once created; 0 until then.
static OVERLAY_HWND: AtomicIsize = AtomicIsize::new(0);
/// Last update time, for auto-clear.
static LAST_UPDATE: Mutex<Option<Instant>> = Mutex::new(None);

/// Annotations vanish on their own this long after the last update, so a
/// viewer that just closes their tab doesn't leave drawings stuck on the
/// screen forever.
const AUTO_CLEAR_AFTER: Duration = Duration::from_secs(45);

/// Black is the color key (fully transparent); drawings use other colors.
const COLOR_KEY: COLORREF = COLORREF(0x000000);

/// Replaces the shown shapes and repaints. Called from the pipe handler.
pub fn set_shapes(shapes: Vec<WireShape>) {
    if let Ok(mut guard) = SHAPES.lock() {
        *guard = shapes;
    }
    if let Ok(mut guard) = LAST_UPDATE.lock() {
        *guard = Some(Instant::now());
    }
    repaint();
}

/// Clears all annotations immediately.
pub fn clear() {
    if let Ok(mut guard) = SHAPES.lock() {
        guard.clear();
    }
    repaint();
}

fn repaint() {
    let hwnd = OVERLAY_HWND.load(Ordering::Relaxed);
    if hwnd != 0 {
        // InvalidateRect is safe to call across threads - it posts a paint
        // request to the window's own thread.
        unsafe {
            let _ = InvalidateRect(HWND(hwnd as *mut _), None, true);
        }
    }
}

pub fn spawn() {
    std::thread::spawn(|| unsafe {
        if let Err(e) = run() {
            tracing::warn!("Annotation overlay window unavailable: {e}");
        }
    });
}

unsafe fn run() -> Result<(), String> {
    let instance = GetModuleHandleW(None).map_err(|e| format!("GetModuleHandleW failed: {e}"))?;

    let class_name = w!("SentinelAnnotationOverlay");
    let wnd_class = WNDCLASSW {
        lpfnWndProc: Some(wnd_proc),
        hInstance: instance.into(),
        lpszClassName: class_name,
        ..Default::default()
    };
    if RegisterClassW(&wnd_class) == 0 {
        return Err("RegisterClassW failed".to_string());
    }

    let (x, y, cx, cy) = (
        GetSystemMetrics(SM_XVIRTUALSCREEN),
        GetSystemMetrics(SM_YVIRTUALSCREEN),
        GetSystemMetrics(SM_CXVIRTUALSCREEN),
        GetSystemMetrics(SM_CYVIRTUALSCREEN),
    );

    let hwnd = CreateWindowExW(
        // LAYERED for the color-key transparency, TRANSPARENT so clicks pass
        // through to the real desktop, NOACTIVATE/TOOLWINDOW so it never
        // steals focus or shows in the task switcher.
        WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_LAYERED | WS_EX_TRANSPARENT,
        class_name,
        w!("Sentinel"),
        WS_POPUP,
        x,
        y,
        cx,
        cy,
        None,
        None,
        instance,
        None,
    )
    .map_err(|e| format!("CreateWindowExW failed: {e}"))?;

    // Black pixels render fully transparent; everything we draw in other
    // colors shows over the live desktop.
    let _ = SetLayeredWindowAttributes(hwnd, COLOR_KEY, 0, LWA_COLORKEY);

    OVERLAY_HWND.store(hwnd.0 as isize, Ordering::Relaxed);

    // Timer: show/hide based on whether there are shapes, and enforce the
    // auto-clear timeout.
    SetTimer(hwnd, 1, 300, None);

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
                // Auto-clear if updates stopped arriving.
                let stale = LAST_UPDATE
                    .lock()
                    .ok()
                    .and_then(|g| *g)
                    .map(|t| t.elapsed() > AUTO_CLEAR_AFTER)
                    .unwrap_or(false);
                if stale {
                    if let Ok(mut g) = SHAPES.lock() {
                        g.clear();
                    }
                    let _ = InvalidateRect(hwnd, None, true);
                }

                let has_shapes = SHAPES.lock().map(|g| !g.is_empty()).unwrap_or(false);
                if has_shapes {
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
                let _ = windows::Win32::UI::WindowsAndMessaging::GetClientRect(hwnd, &mut rect);
                let (cw, ch) = (rect.right - rect.left, rect.bottom - rect.top);

                // Paint the whole surface with the transparent color key
                // first so previously-drawn shapes don't linger.
                let key_brush = CreateSolidBrush(COLOR_KEY);
                FillRect(hdc, &rect, key_brush);
                let _ = DeleteObject(key_brush);

                // Hollow brush so Rectangle() draws outline only.
                let hollow = GetStockObject(HOLLOW_BRUSH);
                SelectObject(hdc, hollow);

                if let Ok(shapes) = SHAPES.lock() {
                    for shape in shapes.iter() {
                        draw_shape(hdc, shape, cw, ch);
                    }
                }

                let _ = EndPaint(hwnd, &ps);
                LRESULT(0)
            }
            _ => DefWindowProcW(hwnd, message, wparam, lparam),
        }
    }
}

/// Parses "#rrggbb" into a GDI COLORREF (0x00bbggrr). Falls back to red.
fn parse_color(hex: &str) -> COLORREF {
    let h = hex.trim_start_matches('#');
    if h.len() == 6 {
        if let (Ok(r), Ok(g), Ok(b)) = (
            u32::from_str_radix(&h[0..2], 16),
            u32::from_str_radix(&h[2..4], 16),
            u32::from_str_radix(&h[4..6], 16),
        ) {
            return COLORREF((b << 16) | (g << 8) | r);
        }
    }
    COLORREF(0x0000FF) // red
}

unsafe fn draw_shape(hdc: windows::Win32::Graphics::Gdi::HDC, shape: &WireShape, cw: i32, ch: i32) {
    if shape.points.is_empty() {
        return;
    }
    let color = parse_color(&shape.color);
    // width is a fraction of screen width; clamp to a sane pixel range.
    let px = ((shape.width * cw as f32).round() as i32).clamp(2, 64);

    let pen: HPEN = CreatePen(PS_SOLID, px, color);
    let old = SelectObject(hdc, pen);

    let to_px = |p: &crate::helper_ipc::WirePoint| POINT {
        x: (p.x * cw as f32).round() as i32,
        y: (p.y * ch as f32).round() as i32,
    };

    match shape.tool.as_str() {
        "rect" => {
            if shape.points.len() >= 2 {
                let a = to_px(&shape.points[0]);
                let b = to_px(&shape.points[1]);
                let _ = Rectangle(hdc, a.x.min(b.x), a.y.min(b.y), a.x.max(b.x), a.y.max(b.y));
            }
        }
        "arrow" => {
            if shape.points.len() >= 2 {
                let a = to_px(&shape.points[0]);
                let b = to_px(&shape.points[1]);
                let _ = MoveToEx(hdc, a.x, a.y, None);
                let _ = LineTo(hdc, b.x, b.y);
                // Arrowhead
                let angle = (b.y as f32 - a.y as f32).atan2(b.x as f32 - a.x as f32);
                let head = (px * 3).max(14) as f32;
                let (h1x, h1y) = (
                    b.x as f32 - head * (angle - std::f32::consts::FRAC_PI_6).cos(),
                    b.y as f32 - head * (angle - std::f32::consts::FRAC_PI_6).sin(),
                );
                let (h2x, h2y) = (
                    b.x as f32 - head * (angle + std::f32::consts::FRAC_PI_6).cos(),
                    b.y as f32 - head * (angle + std::f32::consts::FRAC_PI_6).sin(),
                );
                let _ = MoveToEx(hdc, b.x, b.y, None);
                let _ = LineTo(hdc, h1x as i32, h1y as i32);
                let _ = MoveToEx(hdc, b.x, b.y, None);
                let _ = LineTo(hdc, h2x as i32, h2y as i32);
            }
        }
        // pen and highlight: polyline through all points.
        _ => {
            let pts: Vec<POINT> = shape.points.iter().map(to_px).collect();
            if pts.len() >= 2 {
                let _ = Polyline(hdc, &pts);
            }
        }
    }

    SelectObject(hdc, old);
    let _ = DeleteObject(pen);
}
