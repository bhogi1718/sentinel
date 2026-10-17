import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../realtime/socket", () => ({
  findAgentSocket: vi.fn(),
}));

import { findAgentSocket } from "../../realtime/socket";
import { screenshotService } from "./screenshot.service";
import { ApiError } from "../../common/ApiError";
import { OrgDevice } from "../device/device.types";

const mockedFindAgentSocket = vi.mocked(findAgentSocket, true);

const ONLINE_DEVICE: OrgDevice = {
  id: "device-1",
  orgId: "org-1",
  name: "Laptop",
  isOnline: true,
  lastSeenAt: null,
  createdAt: new Date(),
};

describe("screenshotService.capture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws conflict when the device is offline", async () => {
    await expect(screenshotService.capture({ ...ONLINE_DEVICE, isOnline: false })).rejects.toThrow(ApiError);
    expect(mockedFindAgentSocket).not.toHaveBeenCalled();
  });

  it("throws conflict when the device has no live socket", async () => {
    mockedFindAgentSocket.mockResolvedValue(undefined);

    await expect(screenshotService.capture(ONLINE_DEVICE)).rejects.toThrow(ApiError);
  });

  it("resolves with the PNG bytes reported via resolveResponse", async () => {
    const emit = vi.fn();
    mockedFindAgentSocket.mockResolvedValue({ emit } as never);

    const capturePromise = screenshotService.capture(ONLINE_DEVICE);

    // Emulate agentNamespace.ts's screenshot:response handler resolving the
    // same requestId the service just emitted.
    await vi.waitFor(() => expect(emit).toHaveBeenCalled());
    expect(mockedFindAgentSocket).toHaveBeenCalledWith("device-1");
    const requestId = (emit.mock.calls[0][1] as { requestId: string }).requestId;
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    screenshotService.resolveResponse("device-1", requestId, fakePng);

    await expect(capturePromise).resolves.toEqual(fakePng);
  });

  it("ignores a capture reported by a different device's agent", async () => {
    const emit = vi.fn();
    mockedFindAgentSocket.mockResolvedValue({ emit } as never);

    const capturePromise = screenshotService.capture(ONLINE_DEVICE);

    await vi.waitFor(() => expect(emit).toHaveBeenCalled());
    const requestId = (emit.mock.calls[0][1] as { requestId: string }).requestId;
    screenshotService.resolveResponse("device-2", requestId, Buffer.from("not this one"));
    screenshotService.resolveResponse("device-1", requestId, Buffer.from("this one"));

    await expect(capturePromise).resolves.toEqual(Buffer.from("this one"));
  });

  it("rejects when the agent reports a capture failure", async () => {
    const emit = vi.fn();
    mockedFindAgentSocket.mockResolvedValue({ emit } as never);

    const capturePromise = screenshotService.capture(ONLINE_DEVICE);

    await vi.waitFor(() => expect(emit).toHaveBeenCalled());
    const requestId = (emit.mock.calls[0][1] as { requestId: string }).requestId;
    screenshotService.rejectResponse("device-1", requestId, "No interactive session");

    await expect(capturePromise).rejects.toThrow("No interactive session");
  });
});
