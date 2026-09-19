use std::collections::HashSet;
use windows::Win32::Foundation::{BOOL, HWND, LPARAM};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindow, GetWindowTextLengthW, GetWindowThreadProcessId, IsWindowVisible, GW_OWNER,
};

/// Returns the set of PIDs that own at least one real top-level app window
/// on the CALLING PROCESS's own desktop - the same signal Task Manager
/// uses to split "Apps" from "Background processes". A window counts if
/// it's visible, has a non-empty title, and has no owner window (owned
/// windows are things like tooltips, dropdowns, and dialog children - not
/// top-level apps in their own right).
///
/// This only works meaningfully when called from a process that actually
/// has an interactive desktop - i.e. the per-session helper binary
/// (helper_main.rs), not the LocalSystem service. EnumWindows only ever
/// sees windows on the calling thread's associated desktop, and a
/// Session-0 LocalSystem service has none: getting a Session-0 process to
/// see Session 1's desktop turns out to require crossing a window-station
/// ACL boundary that Windows has deliberately hardened since Vista
/// (Session 0 isolation / shatter-attack mitigation) - impersonating the
/// logged-in user's token and switching the process's window station both
/// still fail with ERROR_INVALID_FUNCTION / ERROR_ACCESS_DENIED in
/// practice. The per-session helper sidesteps all of this by simply
/// running as the interactive user already, where EnumWindows works with
/// zero extra ceremony.
pub fn windowed_pids() -> HashSet<u32> {
    let mut pids = HashSet::new();

    unsafe {
        let _ = EnumWindows(Some(enum_windows_callback), LPARAM(&mut pids as *mut _ as isize));
    }

    pids
}

unsafe extern "system" fn enum_windows_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let pids = &mut *(lparam.0 as *mut HashSet<u32>);

    if !IsWindowVisible(hwnd).as_bool() {
        return BOOL(1);
    }

    if GetWindowTextLengthW(hwnd) == 0 {
        return BOOL(1);
    }

    let owner = GetWindow(hwnd, GW_OWNER).unwrap_or_default();
    if !owner.is_invalid() {
        return BOOL(1);
    }

    let mut pid = 0u32;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
    if pid != 0 {
        pids.insert(pid);
    }

    BOOL(1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prints_windowed_pids() {
        let pids = windowed_pids();
        eprintln!("Found {} windowed PIDs: {:?}", pids.len(), pids);
        assert!(!pids.is_empty(), "expected at least one visible top-level window");
    }
}
