import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./settings.repository", () => ({
  settingsRepository: {
    get: vi.fn(),
    setTelegramConfig: vi.fn(),
    clearTelegramConfig: vi.fn(),
  },
}));

vi.mock("../telegram/telegram.service", () => ({
  telegramService: {
    isConfigured: vi.fn(),
    sendTestMessage: vi.fn(),
  },
}));

import { settingsRepository } from "./settings.repository";
import { telegramService } from "../telegram/telegram.service";
import { settingsService } from "./settings.service";
import { ApiError } from "../../common/ApiError";

const mockedRepo = vi.mocked(settingsRepository, true);
const mockedTelegram = vi.mocked(telegramService, true);

describe("settingsService.getIntegrationStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports connected when Telegram is configured", async () => {
    mockedTelegram.isConfigured.mockResolvedValue(true);

    const status = await settingsService.getIntegrationStatus();
    expect(status).toEqual({ telegram: { connected: true } });
  });

  it("reports not connected when Telegram is unconfigured", async () => {
    mockedTelegram.isConfigured.mockResolvedValue(false);

    const status = await settingsService.getIntegrationStatus();
    expect(status).toEqual({ telegram: { connected: false } });
  });
});

describe("settingsService.connectTelegram", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists the token and chat ID once the test message succeeds", async () => {
    mockedTelegram.sendTestMessage.mockResolvedValue({ ok: true });
    mockedRepo.setTelegramConfig.mockResolvedValue({} as never);

    await settingsService.connectTelegram("bot-token", "chat-id");

    expect(mockedTelegram.sendTestMessage).toHaveBeenCalledWith("bot-token", "chat-id");
    expect(mockedRepo.setTelegramConfig).toHaveBeenCalledWith("bot-token", "chat-id");
  });

  it("rejects and does not persist anything when the test message fails", async () => {
    mockedTelegram.sendTestMessage.mockResolvedValue({ ok: false, error: "chat not found" });

    await expect(settingsService.connectTelegram("bot-token", "wrong-chat-id")).rejects.toThrow(ApiError);
    expect(mockedRepo.setTelegramConfig).not.toHaveBeenCalled();
  });

  it("surfaces the Telegram API's own error message", async () => {
    mockedTelegram.sendTestMessage.mockResolvedValue({ ok: false, error: "chat not found" });

    await expect(settingsService.connectTelegram("bot-token", "wrong-chat-id")).rejects.toThrow("chat not found");
  });
});

describe("settingsService.disconnectTelegram", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears the stored config", async () => {
    mockedRepo.clearTelegramConfig.mockResolvedValue(undefined);

    await settingsService.disconnectTelegram();

    expect(mockedRepo.clearTelegramConfig).toHaveBeenCalledOnce();
  });
});
