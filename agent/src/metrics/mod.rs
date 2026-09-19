mod ping;

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::Duration;
use sysinfo::{Disks, Networks, System};

use crate::events::battery_watcher::battery_percent;

#[derive(Debug, Deserialize)]
pub struct MetricsRequest {
    #[serde(rename = "requestId")]
    pub request_id: String,
}

#[derive(Debug, Serialize)]
pub struct SystemMetrics {
    #[serde(rename = "cpuPercent")]
    cpu_percent: f32,
    #[serde(rename = "memoryUsedBytes")]
    memory_used_bytes: u64,
    #[serde(rename = "memoryTotalBytes")]
    memory_total_bytes: u64,
    #[serde(rename = "diskUsedBytes")]
    disk_used_bytes: u64,
    #[serde(rename = "diskTotalBytes")]
    disk_total_bytes: u64,
    #[serde(rename = "batteryPercent")]
    battery_percent: Option<u8>,
    #[serde(rename = "networkDownloadBytesPerSec")]
    network_download_bytes_per_sec: f64,
    #[serde(rename = "networkUploadBytesPerSec")]
    network_upload_bytes_per_sec: f64,
    #[serde(rename = "networkTotalReceivedBytes")]
    network_total_received_bytes: u64,
    #[serde(rename = "networkTotalTransmittedBytes")]
    network_total_transmitted_bytes: u64,
    #[serde(rename = "pingMs")]
    ping_ms: Option<u32>,
}

/// CPU% and network throughput both need a delta between two samples - a
/// single snapshot of either always reads as zero/meaningless. Shared
/// between the two so only one sleep is needed instead of stacking two.
const SAMPLE_INTERVAL: Duration = Duration::from_millis(500);

/// Windows drive letter the laptop's OS/user profile lives on. Matches the
/// browse_root convention (also under C:\) - a single-drive laptop doesn't
/// need per-drive selection.
const PRIMARY_DRIVE: &str = "C:\\";

pub fn collect_metrics() -> SystemMetrics {
    let mut system = System::new();
    system.refresh_cpu_usage();
    let mut networks = Networks::new_with_refreshed_list();

    std::thread::sleep(SAMPLE_INTERVAL);

    system.refresh_cpu_usage();
    system.refresh_memory();
    networks.refresh();

    let (download_bytes, upload_bytes): (u64, u64) = networks
        .values()
        .fold((0, 0), |(down, up), data| (down + data.received(), up + data.transmitted()));
    let elapsed_secs = SAMPLE_INTERVAL.as_secs_f64();

    let (total_received, total_transmitted): (u64, u64) = networks
        .values()
        .fold((0, 0), |(down, up), data| (down + data.total_received(), up + data.total_transmitted()));

    let disks = Disks::new_with_refreshed_list();
    let primary_disk = disks.list().iter().find(|disk| disk.mount_point() == Path::new(PRIMARY_DRIVE));
    let (disk_total, disk_used) = match primary_disk {
        Some(disk) => {
            let total = disk.total_space();
            let available = disk.available_space();
            (total, total.saturating_sub(available))
        }
        None => (0, 0),
    };

    SystemMetrics {
        cpu_percent: system.global_cpu_usage(),
        memory_used_bytes: system.used_memory(),
        memory_total_bytes: system.total_memory(),
        disk_used_bytes: disk_used,
        disk_total_bytes: disk_total,
        battery_percent: battery_percent(),
        network_download_bytes_per_sec: download_bytes as f64 / elapsed_secs,
        network_upload_bytes_per_sec: upload_bytes as f64 / elapsed_secs,
        network_total_received_bytes: total_received,
        network_total_transmitted_bytes: total_transmitted,
        ping_ms: ping::ping_once(std::net::Ipv4Addr::new(1, 1, 1, 1)),
    }
}
