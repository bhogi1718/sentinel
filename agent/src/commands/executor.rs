use std::ffi::c_void;
use windows::Win32::Foundation::{CloseHandle, HANDLE, LUID};
use windows::Win32::Security::{
    AdjustTokenPrivileges, LookupPrivilegeValueW, LUID_AND_ATTRIBUTES, SE_PRIVILEGE_ENABLED,
    TOKEN_ADJUST_PRIVILEGES, TOKEN_PRIVILEGES, TOKEN_QUERY,
};
use windows::Win32::System::Power::SetSuspendState;
use windows::Win32::System::RemoteDesktop::{WTSGetActiveConsoleSessionId, WTSLogoffSession};
use windows::Win32::System::Shutdown::{ExitWindowsEx, EWX_REBOOT, EWX_SHUTDOWN, SHUTDOWN_REASON};
use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

use super::CommandType;

const SHUTDOWN_REASON_FLAG: SHUTDOWN_REASON = SHUTDOWN_REASON(0);

/// Closes the wrapped HANDLE on drop, so every early `?`-return in a
/// function still releases it - Win32 handles aren't closed automatically
/// like Rust-native resources, and manual `CloseHandle` calls before each
/// return are easy to miss on new/edited error paths.
struct OwnedHandle(HANDLE);

impl Drop for OwnedHandle {
    fn drop(&mut self) {
        if !self.0.is_invalid() {
            let _ = unsafe { CloseHandle(self.0) };
        }
    }
}

/// Executes a remote command and returns Ok(()) if the underlying Win32
/// call reported success, Err(message) otherwise. Note that for
/// Restart/Shutdown/LogOff, "success" only means Windows *accepted* the
/// request - the process is normally killed by the OS itself moments
/// later as the session tears down, so there is rarely a chance to send
/// a follow-up event after these specific commands.
pub fn execute(command_type: CommandType) -> Result<(), String> {
    match command_type {
        CommandType::Restart => exit_windows(EWX_REBOOT),
        CommandType::Shutdown => exit_windows(EWX_SHUTDOWN),
        CommandType::LogOff => log_off_console_session(),
        CommandType::Sleep => sleep(),
        CommandType::Lock => super::executor::lock::lock_workstation(),
        CommandType::KillProcess { pid, name } => crate::processes::kill_process(pid, &name),
    }
}

/// ExitWindowsEx(EWX_LOGOFF) logs off the *calling process's own* session.
/// A LocalSystem service runs in Session 0, which has no interactive user,
/// so that call fails with ERROR_INVALID_FUNCTION there. WTSLogoffSession
/// targets an arbitrary session by ID instead, which works from Session 0
/// as long as the caller holds sufficient privilege (LocalSystem does).
fn log_off_console_session() -> Result<(), String> {
    unsafe {
        let session_id = WTSGetActiveConsoleSessionId();
        if session_id == 0xFFFFFFFF {
            return Err("No active console session (no user logged in)".to_string());
        }

        WTSLogoffSession(None, session_id, false)
            .map_err(|e| format!("WTSLogoffSession failed: {e}"))
    }
}

/// A LocalSystem service holds SeShutdownPrivilege but, like all
/// privileges, it isn't active on the process token until explicitly
/// enabled - without this, ExitWindowsEx(EWX_REBOOT/EWX_SHUTDOWN) fails
/// with ERROR_PRIVILEGE_NOT_HELD even though LocalSystem is entitled to it.
fn exit_windows(flags: windows::Win32::System::Shutdown::EXIT_WINDOWS_FLAGS) -> Result<(), String> {
    unsafe {
        enable_privilege("SeShutdownPrivilege")?;
        ExitWindowsEx(flags, SHUTDOWN_REASON_FLAG).map_err(|e| format!("ExitWindowsEx failed: {e}"))
    }
}

/// Enables a privilege (by name) on the calling process's own token. Needed
/// because Windows privileges are dormant by default even when a token is
/// entitled to hold them - AdjustTokenPrivileges must activate them first.
unsafe fn enable_privilege(privilege_name: &str) -> Result<(), String> {
    let mut raw_token = HANDLE::default();
    OpenProcessToken(GetCurrentProcess(), TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY, &mut raw_token)
        .map_err(|e| format!("OpenProcessToken failed: {e}"))?;
    let process_token = OwnedHandle(raw_token);

    let mut luid = LUID::default();
    let name_wide: Vec<u16> = privilege_name.encode_utf16().chain(std::iter::once(0)).collect();
    LookupPrivilegeValueW(None, windows::core::PCWSTR(name_wide.as_ptr()), &mut luid)
        .map_err(|e| format!("LookupPrivilegeValueW failed: {e}"))?;

    let privileges = TOKEN_PRIVILEGES {
        PrivilegeCount: 1,
        Privileges: [LUID_AND_ATTRIBUTES {
            Luid: luid,
            Attributes: SE_PRIVILEGE_ENABLED,
        }],
    };

    AdjustTokenPrivileges(
        process_token.0,
        false,
        Some(&privileges as *const _ as *const c_void as *const _),
        0,
        None,
        None,
    )
    .map_err(|e| format!("AdjustTokenPrivileges failed: {e}"))
}

fn sleep() -> Result<(), String> {
    // hibernate=false (sleep, not hibernate), force=false (allow apps to
    // block/veto), disable_wake_event=false (allow wake timers).
    let ok = unsafe { SetSuspendState(false, false, false) };
    if ok.as_bool() {
        Ok(())
    } else {
        Err("SetSuspendState failed".to_string())
    }
}

mod lock {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::{CloseHandle, HANDLE};
    use windows::Win32::Security::{
        DuplicateTokenEx, SecurityIdentification, TokenPrimary, TOKEN_ALL_ACCESS,
    };
    use windows::Win32::System::RemoteDesktop::{
        WTSGetActiveConsoleSessionId, WTSQueryUserToken,
    };
    use windows::Win32::System::Threading::{
        CreateProcessAsUserW, CREATE_UNICODE_ENVIRONMENT, PROCESS_INFORMATION, STARTUPINFOW,
    };

    /// LockWorkStation() only affects the calling process's own session,
    /// and a Windows Service (running as LocalSystem in Session 0) has no
    /// interactive session to lock. The documented workaround is to
    /// duplicate the logged-in user's token from their session and launch
    /// a short-lived helper process (rundll32 invoking the same
    /// LockWorkStation entry point) *as that user, in their session* -
    /// the spawned process then locks its own (the user's) session.
    pub fn lock_workstation() -> Result<(), String> {
        unsafe {
            let session_id = WTSGetActiveConsoleSessionId();
            if session_id == 0xFFFFFFFF {
                return Err("No active console session (no user logged in)".to_string());
            }

            let mut raw_user_token = HANDLE::default();
            WTSQueryUserToken(session_id, &mut raw_user_token)
                .map_err(|e| format!("WTSQueryUserToken failed: {e}"))?;
            let user_token = super::OwnedHandle(raw_user_token);

            super::enable_privilege("SeIncreaseQuotaPrivilege")?;

            let mut raw_duplicated_token = HANDLE::default();
            DuplicateTokenEx(
                user_token.0,
                TOKEN_ALL_ACCESS,
                None,
                SecurityIdentification,
                TokenPrimary,
                &mut raw_duplicated_token,
            )
            .map_err(|e| format!("DuplicateTokenEx failed: {e}"))?;
            let duplicated_token = super::OwnedHandle(raw_duplicated_token);

            let mut command_line: Vec<u16> = "rundll32.exe user32.dll,LockWorkStation"
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect();

            let mut startup_info = STARTUPINFOW::default();
            startup_info.cb = std::mem::size_of::<STARTUPINFOW>() as u32;
            let mut process_info = PROCESS_INFORMATION::default();

            let result = CreateProcessAsUserW(
                duplicated_token.0,
                None,
                PWSTR(command_line.as_mut_ptr()),
                None,
                None,
                false,
                CREATE_UNICODE_ENVIRONMENT,
                None,
                None,
                &startup_info,
                &mut process_info,
            );

            match result {
                Ok(()) => {
                    let _ = CloseHandle(process_info.hProcess);
                    let _ = CloseHandle(process_info.hThread);
                    Ok(())
                }
                Err(e) => Err(format!("CreateProcessAsUserW failed: {e}")),
            }
        }
    }
}
