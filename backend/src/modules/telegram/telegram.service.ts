import { logger } from "../../config/logger";
import { settingsRepository } from "../settings/settings.repository";

const TELEGRAM_API_BASE = "https://api.telegram.org";

export const telegramService = {
  async isConfigured(orgId: string): Promise<boolean> {
    const settings = await settingsRepository.get(orgId);
    return Boolean(settings?.telegramBotToken && settings?.telegramChatId);
  },

  /// Sends to the given organization's configured chat, if it has one.
  /// Never rejects: callers fire this and move on (a notification must not
  /// fail the event that triggered it), so every failure - reading the
  /// settings included - is logged here with its organization instead.
  async sendMessage(orgId: string, text: string): Promise<void> {
    try {
      const settings = await settingsRepository.get(orgId);
      if (!settings?.telegramBotToken || !settings.telegramChatId) {
        return;
      }

      const url = `${TELEGRAM_API_BASE}/bot${settings.telegramBotToken}/sendMessage`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: settings.telegramChatId,
          text,
          parse_mode: "HTML",
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        logger.error(`Telegram API returned ${response.status}`, { body });
      }
    } catch (err) {
      logger.error("Failed to send Telegram notification", {
        orgId,
        error: err instanceof Error ? err.message : err,
      });
    }
  },

  /// Sends a one-off test message using bot credentials that haven't been
  /// saved yet - used by the Connect flow to verify a token/chat ID pair
  /// actually works before persisting it, rather than saving first and
  /// discovering it's wrong only when the next real event fires.
  async sendTestMessage(botToken: string, chatId: string): Promise<{ ok: boolean; error?: string }> {
    const url = `${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "✅ Sentinel is now connected to this chat.",
          parse_mode: "HTML",
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { description?: string } | null;
        return { ok: false, error: body?.description ?? `Telegram API returned ${response.status}` };
      }

      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed to reach the Telegram API" };
    }
  },
};
