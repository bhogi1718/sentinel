import axios from "axios";
import { apiClient } from "./client";

export const screenshotApi = {
  /// The backend sends the PNG straight through as the response body
  /// (Content-Type: image/png), not JSON-wrapped like every other endpoint -
  /// responseType "blob" tells axios to hand back raw bytes instead of
  /// trying to JSON.parse an image. On failure the backend still sends its
  /// usual JSON error body, but axios has no way to know that in advance -
  /// it applies responseType to error responses too, so a JSON error
  /// arrives as an opaque Blob rather than a parsed object. Re-parsed back
  /// into a normal axios-shaped error here so extractErrorMessage (which
  /// expects error.response.data.error.message) keeps working unmodified.
  async capture(): Promise<Blob> {
    try {
      const response = await apiClient.post<Blob>("/device/screenshot", undefined, { responseType: "blob" });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
        const text = await error.response.data.text();
        try {
          error.response.data = JSON.parse(text) as unknown;
        } catch {
          // Body wasn't JSON after all - leave it as-is, extractErrorMessage
          // falls back to the generic message in that case.
        }
      }
      throw error;
    }
  },
};
