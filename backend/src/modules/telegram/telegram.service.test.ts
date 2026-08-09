import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../settings/settings.repository", () => ({
  settingsRepository: {
    get: vi.fn(),
  },
}));

import { settingsRepository } from "../settings/settings.repository";
import { telegramService } from "./telegram.service";

const mockedRepo = vi.mocked(settingsRepository, true);

function mockFetchOnce(response: Partial<Response> & { json?: () => Promise<unknown>; text?: () => Promise<string> }) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("telegramService.isConfigured", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("is false when no settings row exists", async () => {
    mockedRepo.get.mockResolvedValue(null);
    await expect(telegramService.isConfigured()).resolves.toBe(false);
  });

  it("is false when only the bot token is set", async () => {
    mockedRepo.get.mockResolvedValue({ telegramBotToken: "token", telegramChatId: null } as never);
    await expect(telegramService.isConfigured()).resolves.toBe(false);
  });

  it("is true when both bot token and chat ID are set", async () => {
    mockedRepo.get.mockResolvedValue({ telegramBotToken: "token", telegramChatId: "chat" } as never);
    await expect(telegramService.isConfigured()).resolves.toBe(true);
  });
});

describe("telegramService.sendMessage", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("does not call the Telegram API when unconfigured", async () => {
    mockedRepo.get.mockResolvedValue(null);
    const fetchMock = mockFetchOnce({ ok: true });

    await telegramService.sendMessage("hello");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to the configured bot's endpoint when configured", async () => {
    mockedRepo.get.mockResolvedValue({ telegramBotToken: "my-token", telegramChatId: "my-chat" } as never);
    const fetchMock = mockFetchOnce({ ok: true });

    await telegramService.sendMessage("hello");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telegram.org/bot" + "my-token" + "/sendMessage",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body) as { chat_id: string; text: string };
    expect(body.chat_id).toBe("my-chat");
    expect(body.text).toBe("hello");
  });
});

describe("telegramService.sendTestMessage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns ok:true on a successful send", async () => {
    mockFetchOnce({ ok: true });

    const result = await telegramService.sendTestMessage("token", "chat");
    expect(result).toEqual({ ok: true });
  });

  it("returns the Telegram API's error description on failure", async () => {
    mockFetchOnce({ ok: false, status: 400, json: () => Promise.resolve({ description: "chat not found" }) });

    const result = await telegramService.sendTestMessage("token", "wrong-chat");
    expect(result).toEqual({ ok: false, error: "chat not found" });
  });

  it("returns a generic error when the API is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );

    const result = await telegramService.sendTestMessage("token", "chat");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("network down");
  });
});
