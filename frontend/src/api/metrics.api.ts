import { apiClient } from "./client";
import { devicePath, type DeviceRef } from "./paths";

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

export const metricsApi = {
  async get(ref: DeviceRef): Promise<SystemMetrics> {
    const response = await apiClient.get<{ success: true; data: SystemMetrics }>(`${devicePath(ref)}/metrics`);
    return response.data.data;
  },
};
