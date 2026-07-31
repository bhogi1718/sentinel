use serde::{Deserialize, Serialize};
use sysinfo::System;

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
}

/// sysinfo's per-process CPU% is a delta since the last refresh, so a
/// single snapshot always reports 0% - two refreshes separated by a
/// short interval are required to get a real, comparable reading.
const CPU_SAMPLE_INTERVAL: std::time::Duration = std::time::Duration::from_millis(300);

pub fn list_processes() -> Vec<ProcessInfo> {
    let mut system = System::new_all();
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    std::thread::sleep(CPU_SAMPLE_INTERVAL);
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    system
        .processes()
        .values()
        .map(|process| ProcessInfo {
            pid: process.pid().as_u32(),
            name: process.name().to_string_lossy().into_owned(),
            cpu_percent: process.cpu_usage(),
            memory_bytes: process.memory(),
        })
        .collect()
}
