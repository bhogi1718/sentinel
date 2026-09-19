export interface SystemMetrics {
  cpuPercent: number;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  diskUsedBytes: number;
  diskTotalBytes: number;
  batteryPercent: number | null;
  networkDownloadBytesPerSec: number;
  networkUploadBytesPerSec: number;
  networkTotalReceivedBytes: number;
  networkTotalTransmittedBytes: number;
  pingMs: number | null;
}
