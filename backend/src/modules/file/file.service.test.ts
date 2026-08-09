import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../device/device.repository", () => ({
  deviceRepository: {
    findFirst: vi.fn(),
  },
}));

vi.mock("../../realtime/socket", () => ({
  findAgentSocket: vi.fn(),
}));

import { deviceRepository } from "../device/device.repository";
import { findAgentSocket } from "../../realtime/socket";
import { fileService } from "./file.service";
import { ApiError } from "../../common/ApiError";

const mockedRepo = vi.mocked(deviceRepository, true);
const mockedFindAgentSocket = vi.mocked(findAgentSocket, true);

const noopHandlers = { onChunk: vi.fn(), onComplete: vi.fn(), onError: vi.fn() };

// pendingDownloads lives at module scope in file.service.ts (it has to,
// since agentNamespace.ts's response handlers need to reach the same map
// startDownload populated) - so every test must explicitly drain whatever
// it started, or later tests inherit "in flight" downloads that were never
// really pending.
async function startAndCollectRequestId(path: string): Promise<string> {
  await fileService.startDownload(path, noopHandlers);
  const emitMock = mockedFindAgentSocket.mock.results.at(-1)?.value as Promise<{ emit: ReturnType<typeof vi.fn> }>;
  const emit = (await emitMock).emit;
  const lastCall = emit.mock.calls.at(-1) as [string, { requestId: string }];
  return lastCall[1].requestId;
}

describe("fileService.startDownload concurrency cap", () => {
  const requestIdsToDrain: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    mockedRepo.findFirst.mockResolvedValue({ id: "device-1", isOnline: true } as never);
    mockedFindAgentSocket.mockImplementation(() => Promise.resolve({ emit: vi.fn() } as never));
  });

  afterEach(() => {
    while (requestIdsToDrain.length > 0) {
      fileService.handleDownloadComplete(requestIdsToDrain.pop()!);
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

    await expect(fileService.startDownload("file-overflow.txt", noopHandlers)).rejects.toThrow(ApiError);
  });

  it("frees a concurrency slot once a download completes", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push(await startAndCollectRequestId(`file-${i}.txt`));
    }

    // Completing one in-flight download (the same way agentNamespace.ts's
    // files:download:complete handler would) must free its slot.
    fileService.handleDownloadComplete(ids.shift()!);
    requestIdsToDrain.push(...ids);

    requestIdsToDrain.push(await startAndCollectRequestId("file-after-complete.txt"));
  });
});
