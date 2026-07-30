import { apiClient } from "./client";

export interface IntegrationStatus {
  telegram: { connected: boolean };
}

export const settingsApi = {
  async getIntegrationStatus(): Promise<IntegrationStatus> {
    const response = await apiClient.get<{ success: true; data: IntegrationStatus }>("/settings/integrations");
    return response.data.data;
  },
};
