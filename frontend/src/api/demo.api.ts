import type { AuthTokens } from "./auth.api";
import { apiClient } from "./client";

export const demoApi = {
  /// Whether this deployment offers the public demo.
  async isEnabled(): Promise<boolean> {
    const response = await apiClient.get<{ success: true; data: { enabled: boolean } }>("/demo");
    return response.data.data.enabled;
  },

  /// Signs in as the shared demo visitor - no account needed.
  async startSession(): Promise<AuthTokens> {
    const response = await apiClient.post<{ success: true; data: AuthTokens }>("/demo/session");
    return response.data.data;
  },
};
