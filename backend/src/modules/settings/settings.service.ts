import { ApiError } from "../../common/ApiError";
import { telegramService } from "../telegram/telegram.service";
import { settingsRepository } from "./settings.repository";

export const settingsService = {
  async getIntegrationStatus() {
    return { telegram: { connected: await telegramService.isConfigured() } };
  },

  /// Verifies the token/chat ID actually work (a real Telegram API call)
  /// before persisting them - a typo'd chat ID would otherwise silently
  /// sit in the database until the next real event fails to deliver.
  async connectTelegram(botToken: string, chatId: string): Promise<void> {
    const result = await telegramService.sendTestMessage(botToken, chatId);
    if (!result.ok) {
      throw ApiError.badRequest(result.error ?? "Could not verify the Telegram bot token and chat ID");
    }

    await settingsRepository.setTelegramConfig(botToken, chatId);
  },

  async disconnectTelegram(): Promise<void> {
    await settingsRepository.clearTelegramConfig();
  },
};
