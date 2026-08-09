-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "telegramBotToken" TEXT,
    "telegramChatId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);
