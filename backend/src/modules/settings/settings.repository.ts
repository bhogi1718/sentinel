import { prisma } from "../../prisma/client";

// Settings is a singleton table (see schema.prisma) - these helpers always
// operate on "the" row, creating it on first write if it doesn't exist yet
// rather than requiring a separate seed step the way User/Device do (there's
// nothing meaningful to seed here; an unconfigured Settings row is just the
// all-null default state).
export const settingsRepository = {
  get() {
    return prisma.settings.findFirst();
  },

  async setTelegramConfig(botToken: string, chatId: string) {
    const existing = await prisma.settings.findFirst();
    if (existing) {
      return prisma.settings.update({
        where: { id: existing.id },
        data: { telegramBotToken: botToken, telegramChatId: chatId },
      });
    }
    return prisma.settings.create({
      data: { telegramBotToken: botToken, telegramChatId: chatId },
    });
  },

  async clearTelegramConfig() {
    const existing = await prisma.settings.findFirst();
    if (!existing) return;
    await prisma.settings.update({
      where: { id: existing.id },
      data: { telegramBotToken: null, telegramChatId: null },
    });
  },
};
