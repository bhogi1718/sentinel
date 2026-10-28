import { apiClient } from "./client";
import { devicePath, orgPath, type DeviceRef } from "./paths";

export interface Device {
  id: string;
  orgId: string;
  name: string;
  isOnline: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface CreatedDevice {
  device: Device;
  /// The agent token. Returned exactly once, at creation - the server keeps
  /// only its hash.
  token: string;
}

export const deviceApi = {
  async list(orgId: string): Promise<Device[]> {
    const response = await apiClient.get<{ success: true; data: Device[] }>(`${orgPath(orgId)}/devices`);
    return response.data.data;
  },

  async get(ref: DeviceRef): Promise<Device> {
    const response = await apiClient.get<{ success: true; data: Device }>(devicePath(ref));
    return response.data.data;
  },

  async create(orgId: string, name: string): Promise<CreatedDevice> {
    const response = await apiClient.post<{ success: true; data: CreatedDevice }>(`${orgPath(orgId)}/devices`, { name });
    return response.data.data;
  },

  async remove(ref: DeviceRef): Promise<void> {
    await apiClient.delete(devicePath(ref));
  },
};
