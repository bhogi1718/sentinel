import { apiClient, getAccessToken } from "./client";
import { devicePath, type DeviceRef } from "./paths";
import { API_BASE_URL } from "@/lib/apiConfig";

export interface FileEntry {
  name: string;
  isDirectory: boolean;
  sizeBytes: number;
  modifiedAt: string;
}

export const fileApi = {
  async list(ref: DeviceRef, path: string): Promise<FileEntry[]> {
    const response = await apiClient.get<{ success: true; data: FileEntry[] }>(`${devicePath(ref)}/files`, {
      params: { path },
    });
    return response.data.data;
  },

  /// Downloads are plain browser navigation (an <a href>), which can't
  /// attach an Authorization header - the access token travels as a query
  /// param instead, accepted only by this one endpoint (authGuardQuery on
  /// the backend) rather than relaxing auth everywhere.
  downloadUrl(ref: DeviceRef, path: string): string {
    const token = getAccessToken() ?? "";
    const params = new URLSearchParams({ path, token });
    return `${API_BASE_URL}/api${devicePath(ref)}/files/download?${params.toString()}`;
  },
};
