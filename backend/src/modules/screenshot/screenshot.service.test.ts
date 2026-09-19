import { beforeEach, describe, expect, it, vi } from "vitest";

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
import { screenshotService } from "./screenshot.service";
import { ApiError } from "../../common/ApiError";

const mockedRepo = vi.mocked(deviceRepository, true);
const mockedFindAgentSocket = vi.mocked(findAgentSocket, true);

describe("screenshotService.capture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws not found when no device has been registered", async () => {
    mockedRepo.findFirst.mockResolvedValue(null);

    await expect(screenshotService.capture()).rejects.toThrow(ApiError);
  });

  it("throws conflict when the device is offline", async () => {
    mockedRepo.findFirst.mockResolvedValue({ id: "device-1", isOnline: false } as never);

    await expect(screenshotService.capture()).rejects.toThrow(ApiError);
  });

  it("throws conflict when the device has no live socket", async () => {
    mockedRepo.findFirst.mockResolvedValue({ id: "device-1", isOnline: true } as never);
    mockedFindAgentSocket.mockResolvedValue(undefined);

    await expect(screenshotService.capture()).rejects.toThrow(ApiError);
  });

  it("resolves with the PNG bytes reported via resolveResponse", async () => {
    mockedRepo.findFirst.mockResolvedValue({ id: "device-1", isOnline: true } as never);
    const emit = vi.fn();
    mockedFindAgentSocket.mockResolvedValue({ emit } as never);

    const capturePromise = screenshotService.capture();

    // Emulate agentNamespace.ts's screenshot:response handler resolving the
    // same requestId the service just emitted.
    await vi.waitFor(() => expect(emit).toHaveBeenCalled());
    const requestId = (emit.mock.calls[0][1] as { requestId: string }).requestId;
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    screenshotService.resolveResponse(requestId, fakePng);

    await expect(capturePromise).resolves.toEqual(fakePng);
  });

  it("rejects when the agent reports a capture failure", async () => {
    mockedRepo.findFirst.mockResolvedValue({ id: "device-1", isOnline: true } as never);
    const emit = vi.fn();
    mockedFindAgentSocket.mockResolvedValue({ emit } as never);

    const capturePromise = screenshotService.capture();

    await vi.waitFor(() => expect(emit).toHaveBeenCalled());
    const requestId = (emit.mock.calls[0][1] as { requestId: string }).requestId;
    screenshotService.rejectResponse(requestId, "No interactive session");

    await expect(capturePromise).rejects.toThrow("No interactive session");
  });
});
