import { prisma } from "../../prisma/client";

// At most one settings row exists per organization (orgId is unique), and
// none until something is first configured - so reads may return null and
// writes upsert rather than requiring a separate seed step.
export const settingsRepository = {
  get(orgId: string) {
    return prisma.organizationSettings.findUnique({ where: { orgId } });
  },

  setTelegramConfig(orgId: string, botToken: string, chatId: string) {
    return prisma.organizationSettings.upsert({
      where: { orgId },
      create: { orgId, telegramBotToken: botToken, telegramChatId: chatId },
      update: { telegramBotToken: botToken, telegramChatId: chatId },
    });
  },

  async clearTelegramConfig(orgId: string) {
    await prisma.organizationSettings.updateMany({
      where: { orgId },
      data: { telegramBotToken: null, telegramChatId: null },
    });
  },
};
