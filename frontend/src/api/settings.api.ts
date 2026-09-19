import { apiClient } from "./client";

export interface IntegrationStatus {
  telegram: { connected: boolean };
}

export const settingsApi = {
  async getIntegrationStatus(): Promise<IntegrationStatus> {
    const response = await apiClient.get<{ success: true; data: IntegrationStatus }>("/settings/integrations");
    return response.data.data;
  },

  async connectTelegram(botToken: string, chatId: string): Promise<void> {
    await apiClient.post("/settings/integrations/telegram", { botToken, chatId });
  },

  async disconnectTelegram(): Promise<void> {
    await apiClient.delete("/settings/integrations/telegram");
  },
};
