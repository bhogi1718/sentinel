import { apiClient } from "./client";
import { devicePath, type DeviceRef } from "./paths";

export interface ProcessInfo {
  pid: number;
  name: string;
  cpuPercent: number;
  memoryBytes: number;
  isApp: boolean;
}

export const processApi = {
  async list(ref: DeviceRef): Promise<ProcessInfo[]> {
    const response = await apiClient.get<{ success: true; data: ProcessInfo[] }>(`${devicePath(ref)}/processes`);
    return response.data.data;
  },
};
