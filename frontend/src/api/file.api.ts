import { apiClient, getAccessToken } from "./client";

export interface FileEntry {
  name: string;
  isDirectory: boolean;
  sizeBytes: number;
  modifiedAt: string;
}

export const fileApi = {
  async list(path: string): Promise<FileEntry[]> {
    const response = await apiClient.get<{ success: true; data: FileEntry[] }>("/device/files", {
      params: { path },
    });
    return response.data.data;
  },

  /// Downloads are plain browser navigation (an <a href>), which can't
  /// attach an Authorization header - the access token travels as a query
  /// param instead, accepted only by this one endpoint (authGuardQuery on
  /// the backend) rather than relaxing auth everywhere.
  downloadUrl(path: string): string {
    const token = getAccessToken() ?? "";
    const params = new URLSearchParams({ path, token });
    return `/api/device/files/download?${params.toString()}`;
  },
};
