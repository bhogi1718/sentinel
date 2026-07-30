import { apiClient } from "./client";

export interface DeviceStatus {
  id: string;
  name: string;
  isOnline: boolean;
  lastSeenAt: string | null;
}

export const deviceApi = {
  async getStatus(): Promise<DeviceStatus> {
    const response = await apiClient.get<{ success: true; data: DeviceStatus }>("/device/status");
    return response.data.data;
  },
};
