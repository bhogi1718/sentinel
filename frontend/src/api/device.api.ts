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

/// A code an agent exchanges for a new device and its token. The code is
/// returned exactly once, at creation - the server keeps only its hash.
export interface PairingCode {
  id: string;
  code: string;
  deviceName: string;
  expiresAt: string;
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

  async createPairingCode(orgId: string, name: string): Promise<PairingCode> {
    const response = await apiClient.post<{ success: true; data: PairingCode }>(`${orgPath(orgId)}/devices/pairing-codes`, { name });
    return response.data.data;
  },

  async cancelPairingCode(orgId: string, pairingCodeId: string): Promise<void> {
    await apiClient.delete(`${orgPath(orgId)}/devices/pairing-codes/${pairingCodeId}`);
  },

  async remove(ref: DeviceRef): Promise<void> {
    await apiClient.delete(devicePath(ref));
  },
};
