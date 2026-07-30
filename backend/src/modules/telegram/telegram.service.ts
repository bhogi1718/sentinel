import { env } from "../../config/env";
import { logger } from "../../config/logger";

const TELEGRAM_API_BASE = "https://api.telegram.org";

export const telegramService = {
  isConfigured(): boolean {
    return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
  },

  async sendMessage(text: string): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }

    const url = `${TELEGRAM_API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
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
        error: err instanceof Error ? err.message : err,
      });
    }
  },
};
