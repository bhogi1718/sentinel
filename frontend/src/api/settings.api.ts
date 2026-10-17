import { apiClient } from "./client";
import { orgPath } from "./paths";

export interface IntegrationStatus {
  telegram: { connected: boolean };
}

export const settingsApi = {
  async getIntegrationStatus(orgId: string): Promise<IntegrationStatus> {
    const response = await apiClient.get<{ success: true; data: IntegrationStatus }>(
      `${orgPath(orgId)}/settings/integrations`,
    );
    return response.data.data;
  },

  async connectTelegram(orgId: string, botToken: string, chatId: string): Promise<void> {
    await apiClient.post(`${orgPath(orgId)}/settings/integrations/telegram`, { botToken, chatId });
  },

  async disconnectTelegram(orgId: string): Promise<void> {
    await apiClient.delete(`${orgPath(orgId)}/settings/integrations/telegram`);
  },
};
