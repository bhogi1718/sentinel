import { apiClient } from "./client";

export interface ProcessInfo {
  pid: number;
  name: string;
  cpuPercent: number;
  memoryBytes: number;
}

export const processApi = {
  async list(): Promise<ProcessInfo[]> {
    const response = await apiClient.get<{ success: true; data: ProcessInfo[] }>("/device/processes");
    return response.data.data;
  },
};
