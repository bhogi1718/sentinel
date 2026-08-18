use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::ffi::OsStr;
use std::io::Read;
use std::time::Duration;
use sysinfo::{Pid, System};

use crate::helper_ipc::{write_request, HelperRequest, WindowedPidsResponse, PIPE_NAME};

/// Sentinel's own processes are never killable through this command - doing
/// so would strand the session with no remote channel left to recover it
/// (see kill_process's doc comment for the full rationale). Matched
/// case-insensitively against the process name sysinfo reports, not the
/// full path, since that's all a Kill request's stale-PID re-check has to
/// compare against anyway.
const PROTECTED_PROCESS_NAMES: &[&str] = &["sentinel-agent.exe", "sentinel-agent-helper.exe"];

#[derive(Debug, Deserialize)]
pub struct ProcessListRequest {
    #[serde(rename = "requestId")]
    pub request_id: String,
}

#[derive(Debug, Serialize)]
pub struct ProcessInfo {
    pid: u32,
    name: String,
    #[serde(rename = "cpuPercent")]
    cpu_percent: f32,
    #[serde(rename = "memoryBytes")]
    memory_bytes: u64,
    #[serde(rename = "isApp")]
    is_app: bool,
}

/// sysinfo's per-process CPU% is a delta since the last refresh, so a
/// single snapshot always reads 0% - two refreshes separated by a short
/// interval are required to get a real, comparable reading.
const CPU_SAMPLE_INTERVAL: Duration = Duration::from_millis(300);

/// How long to wait for the per-session helper to respond before giving up
/// and reporting every process as background-only. Generous, but bounded -
/// this runs inside the same spawn_blocking call as the sysinfo refresh, so
/// it can't hang the process-list request indefinitely if the helper isn't
/// running (e.g. no one is logged in yet, or it hasn't been provisioned).
const HELPER_TIMEOUT: Duration = Duration::from_secs(3);

pub fn list_processes() -> Vec<ProcessInfo> {
    let mut system = System::new_all();
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    std::thread::sleep(CPU_SAMPLE_INTERVAL);
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    // Same signal Task Manager uses to split "Apps" from "Background
    // processes": whether the process owns at least one visible top-level
    // window. The LocalSystem service itself has no reliable way to see
    // the interactive desktop's windows (see windows_apps.rs) - the
    // per-session helper does this lookup instead and answers over a
    // named pipe.
    let windowed_pids = fetch_windowed_pids();

    system
        .processes()
        .values()
        .map(|process| {
            let pid = process.pid().as_u32();
            ProcessInfo {
                pid,
                name: process.name().to_string_lossy().into_owned(),
                cpu_percent: process.cpu_usage(),
                memory_bytes: process.memory(),
                is_app: windowed_pids.contains(&pid),
            }
        })
        .collect()
}

/// Terminates a single process by PID, but only after re-confirming it
/// still owns the name the caller expects. The dashboard's process list is
/// always a few seconds stale by the time a Kill request round-trips back
/// here (page load, click, HTTP request, Socket.IO relay) - in that window
/// Windows can reuse the PID for a completely different, newly-started
/// process. Killing by PID alone (the way Task Manager does, trusting its
/// own live view) would risk terminating whatever unrelated process now
/// holds that number instead of the one the user actually clicked. This
/// also refuses to touch Sentinel's own processes, since killing the agent
/// mid-session leaves no remote channel to recover the mistake with short
/// of physical/RDP access to the machine.
pub fn kill_process(pid: u32, expected_name: &str) -> Result<(), String> {
    // PID 0 (Idle) and PID 4 (System) aren't real killable processes on
    // Windows - they're kernel bookkeeping entries sysinfo surfaces for
    // completeness. TerminateProcess would just fail on them anyway, but
    // rejecting up front gives a clearer error than an opaque Win32 one.
    if pid == 0 || pid == 4 {
        return Err(format!("PID {pid} is a protected system process and cannot be terminated"));
    }

    let mut system = System::new_all();
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    let process = system
        .process(Pid::from_u32(pid))
        .ok_or_else(|| format!("No process with PID {pid} (it may have already exited)"))?;

    let actual_name = process.name();
    if !name_matches(actual_name, expected_name) {
        return Err(format!(
            "Process no longer matches (PID {pid} is now '{}', expected '{expected_name}' - the PID may have been reused)",
            actual_name.to_string_lossy(),
        ));
    }

    if is_protected(actual_name) {
        return Err(format!("Refusing to kill '{expected_name}' - this is a Sentinel process"));
    }

    if process.kill() {
        Ok(())
    } else {
        Err(format!("Failed to terminate PID {pid} (insufficient privilege, or it exited just now)"))
    }
}

fn name_matches(actual: &OsStr, expected: &str) -> bool {
    actual.to_string_lossy().eq_ignore_ascii_case(expected)
}

fn is_protected(name: &OsStr) -> bool {
    let name = name.to_string_lossy();
    PROTECTED_PROCESS_NAMES.iter().any(|protected| name.eq_ignore_ascii_case(protected))
}

/// Connects to the per-session helper's named pipe and reads back its
/// windowed-PID response. Windows named pipes are reachable as ordinary
/// filesystem paths on the client side, so plain std::fs I/O works here -
/// no async runtime needed for what's already a synchronous, blocking-pool
/// code path. Returns an empty set on any failure (helper not running,
/// pipe busy, timeout, malformed response) rather than erroring the whole
/// process listing - "background" is a safe default for every process
/// when the app/background split can't be determined.
fn fetch_windowed_pids() -> HashSet<u32> {
    let start = std::time::Instant::now();

    loop {
        match std::fs::OpenOptions::new().read(true).write(true).open(PIPE_NAME) {
            Ok(mut pipe) => {
                if let Err(e) = write_request(&mut pipe, &HelperRequest::WindowedPids) {
                    tracing::warn!("Failed to send request to helper pipe: {e}");
                    return HashSet::new();
                }

                let mut buf = Vec::new();
                if let Err(e) = pipe.read_to_end(&mut buf) {
                    tracing::warn!("Failed to read from helper pipe: {e}");
                    return HashSet::new();
                }

                return match serde_json::from_slice::<WindowedPidsResponse>(&buf) {
                    Ok(response) => response.pids.into_iter().collect(),
                    Err(e) => {
                        tracing::warn!("Failed to parse helper response: {e}");
                        HashSet::new()
                    }
                };
            }
            Err(e) => {
                // ERROR_PIPE_BUSY (231): the helper is mid-response to a
                // different request - back off briefly and retry within
                // the timeout budget, rather than treating a momentary
                // busy pipe the same as "helper isn't running at all".
                if e.raw_os_error() == Some(231) && start.elapsed() < HELPER_TIMEOUT {
                    std::thread::sleep(Duration::from_millis(100));
                    continue;
                }

                tracing::warn!("Could not connect to helper pipe (is the helper running for the logged-in user?): {e}");
                return HashSet::new();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kill_process_rejects_pid_0_and_4_without_touching_sysinfo() {
        let err_idle = kill_process(0, "Idle").unwrap_err();
        assert!(err_idle.contains("protected"));

        let err_system = kill_process(4, "System").unwrap_err();
        assert!(err_system.contains("protected"));
    }

    #[test]
    fn kill_process_rejects_an_unlikely_pid_as_not_found() {
        // Not a guaranteed-unused PID on every system, but astronomically
        // unlikely to collide with a real process in a test run.
        let err = kill_process(u32::MAX - 1, "nonexistent.exe").unwrap_err();
        assert!(err.contains("No process with PID"));
    }

    #[test]
    fn kill_process_rejects_a_name_mismatch_against_a_real_process() {
        // The test binary's own process is guaranteed to exist under the
        // current PID - asserting the *wrong* expected name against it
        // exercises the stale-PID / name-reuse guard without needing to
        // spawn or kill anything.
        let own_pid = std::process::id();
        let err = kill_process(own_pid, "definitely-not-this-process.exe").unwrap_err();
        assert!(err.contains("no longer matches"), "expected a name-mismatch error, got: {err}");
    }

    #[test]
    fn kill_process_refuses_protected_sentinel_process_names_by_construction() {
        // is_protected is exercised indirectly through kill_process's
        // guard, but is also correct to check directly: a name-mismatch
        // error (checked before the protected check) must never mask a
        // true protected-name match once the names line up.
        assert!(is_protected(OsStr::new("sentinel-agent.exe")));
        assert!(is_protected(OsStr::new("SENTINEL-AGENT-HELPER.EXE")));
        assert!(!is_protected(OsStr::new("notepad.exe")));
    }

    #[test]
    fn name_matches_is_case_insensitive() {
        assert!(name_matches(OsStr::new("Chrome.exe"), "chrome.exe"));
        assert!(!name_matches(OsStr::new("chrome.exe"), "firefox.exe"));
    }
}
