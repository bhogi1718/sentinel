import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../realtime/socket", () => ({
  findAgentSocket: vi.fn(),
}));

import { findAgentSocket } from "../../realtime/socket";
import { fileService } from "./file.service";
import { ApiError } from "../../common/ApiError";
import { OrgDevice } from "../device/device.types";

const mockedFindAgentSocket = vi.mocked(findAgentSocket, true);

const DEVICE: OrgDevice = {
  id: "device-1",
  orgId: "org-1",
  name: "Laptop",
  isOnline: true,
  lastSeenAt: null,
  createdAt: new Date(),
};

const OTHER_DEVICE: OrgDevice = { ...DEVICE, id: "device-2", orgId: "org-2" };

const noopHandlers = { onChunk: vi.fn(), onComplete: vi.fn(), onError: vi.fn() };

// pendingDownloads lives at module scope in file.service.ts (it has to,
// since agentNamespace.ts's response handlers need to reach the same map
// startDownload populated) - so every test must explicitly drain whatever
// it started, or later tests inherit "in flight" downloads that were never
// really pending.
async function startAndCollectRequestId(path: string, device: OrgDevice = DEVICE): Promise<string> {
  await fileService.startDownload(device, path, noopHandlers);
  const emitMock = mockedFindAgentSocket.mock.results.at(-1)?.value as Promise<{ emit: ReturnType<typeof vi.fn> }>;
  const emit = (await emitMock).emit;
  const lastCall = emit.mock.calls.at(-1) as [string, { requestId: string }];
  return lastCall[1].requestId;
}

describe("fileService.startDownload concurrency cap", () => {
  const requestIdsToDrain: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    mockedFindAgentSocket.mockImplementation(() => Promise.resolve({ emit: vi.fn() } as never));
  });

  afterEach(() => {
    while (requestIdsToDrain.length > 0) {
      fileService.handleDownloadComplete(DEVICE.id, requestIdsToDrain.pop()!);
    }
  });

  it("allows starting downloads up to the concurrency cap", async () => {
    // MAX_CONCURRENT_DOWNLOADS is 5 - the first 5 concurrent starts must
    // all succeed since nothing has completed/errored/timed-out yet.
    for (let i = 0; i < 5; i++) {
      requestIdsToDrain.push(await startAndCollectRequestId(`file-${i}.txt`));
    }
  });

  it("rejects the 6th concurrent download once the cap is reached", async () => {
    for (let i = 0; i < 5; i++) {
      requestIdsToDrain.push(await startAndCollectRequestId(`file-${i}.txt`));
    }

    await expect(fileService.startDownload(DEVICE, "file-overflow.txt", noopHandlers)).rejects.toThrow(ApiError);
  });

  it("caps downloads per device, so a busy device doesn't block another", async () => {
    for (let i = 0; i < 5; i++) {
      requestIdsToDrain.push(await startAndCollectRequestId(`file-${i}.txt`));
    }

    const otherId = await startAndCollectRequestId("other-device-file.txt", OTHER_DEVICE);
    fileService.handleDownloadComplete(OTHER_DEVICE.id, otherId);
  });

  it("does not let another device's agent complete a download", async () => {
    const id = await startAndCollectRequestId("file.txt");
    const handlers = { onChunk: vi.fn(), onComplete: vi.fn(), onError: vi.fn() };
    mockedFindAgentSocket.mockImplementation(() => Promise.resolve({ emit: vi.fn() } as never));
    await fileService.startDownload(DEVICE, "watched.txt", handlers);
    const emit = (await (mockedFindAgentSocket.mock.results.at(-1)?.value as Promise<{ emit: ReturnType<typeof vi.fn> }>)).emit;
    const watchedId = (emit.mock.calls.at(-1) as [string, { requestId: string }])[1].requestId;

    fileService.handleDownloadChunk(OTHER_DEVICE.id, watchedId, Buffer.from("injected"));
    fileService.handleDownloadComplete(OTHER_DEVICE.id, watchedId);
    expect(handlers.onChunk).not.toHaveBeenCalled();
    expect(handlers.onComplete).not.toHaveBeenCalled();

    fileService.handleDownloadChunk(DEVICE.id, watchedId, Buffer.from("real"));
    fileService.handleDownloadComplete(DEVICE.id, watchedId);
    expect(handlers.onChunk).toHaveBeenCalledWith(Buffer.from("real"));
    expect(handlers.onComplete).toHaveBeenCalledOnce();

    requestIdsToDrain.push(id);
  });

  it("holds the per-device cap even when requests arrive at the same moment", async () => {
    // A slow agent lookup is exactly the window in which concurrent requests
    // used to slip past the cap check.
    mockedFindAgentSocket.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ emit: vi.fn() } as never), 20)),
    );

    const results = await Promise.allSettled(
      Array.from({ length: 7 }, (_, i) => fileService.startDownload(DEVICE, `burst-${i}.txt`, noopHandlers)),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(2);

    for (const call of mockedFindAgentSocket.mock.results) {
      const socket = (await call.value) as { emit: ReturnType<typeof vi.fn> };
      for (const [, payload] of socket.emit.mock.calls as [string, { requestId: string }][]) {
        fileService.handleDownloadComplete(DEVICE.id, payload.requestId);
      }
    }
  });

  it("releases its slot when the agent turns out to be unreachable", async () => {
    mockedFindAgentSocket.mockResolvedValue(undefined);

    for (let i = 0; i < 6; i++) {
      await expect(fileService.startDownload(DEVICE, `unreachable-${i}.txt`, noopHandlers)).rejects.toThrow(
        "not currently connected",
      );
    }
  });

  it("frees a concurrency slot once a download completes", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push(await startAndCollectRequestId(`file-${i}.txt`));
    }

    // Completing one in-flight download (the same way agentNamespace.ts's
    // files:download:complete handler would) must free its slot.
    fileService.handleDownloadComplete(DEVICE.id, ids.shift()!);
    requestIdsToDrain.push(...ids);

    requestIdsToDrain.push(await startAndCollectRequestId("file-after-complete.txt"));
  });
});
