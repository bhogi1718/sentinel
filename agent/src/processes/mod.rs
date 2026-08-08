use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::io::Read;
use std::time::Duration;
use sysinfo::System;

use crate::helper_ipc::{WindowedPidsResponse, PIPE_NAME};

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
        match std::fs::File::open(PIPE_NAME) {
            Ok(mut pipe) => {
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
