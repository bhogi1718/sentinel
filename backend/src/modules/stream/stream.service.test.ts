import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../realtime/socket", () => ({
  findAgentSocket: vi.fn(),
  broadcastStreamFrame: vi.fn(),
  broadcastStreamState: vi.fn(),
}));

import { broadcastStreamFrame, broadcastStreamState, findAgentSocket } from "../../realtime/socket";
import { OrgDevice } from "../device/device.types";
import { streamService } from "./stream.service";

const mockedFindAgentSocket = vi.mocked(findAgentSocket, true);
const mockedFrame = vi.mocked(broadcastStreamFrame, true);
const mockedState = vi.mocked(broadcastStreamState, true);

function device(id: string, orgId: string): OrgDevice {
  return { id, orgId, name: id, isOnline: true, lastSeenAt: null, createdAt: new Date() };
}

const DEVICE_A = device("device-a", "org-1");
const DEVICE_B = device("device-b", "org-2");

const agents: Record<string, { emit: ReturnType<typeof vi.fn> }> = {};

/// The session id the service told a device's agent to stream under.
function sessionIdOf(deviceId: string): string {
  const call = agents[deviceId].emit.mock.calls.find(([event]) => event === "stream:start") as
    | [string, { sessionId: string }]
    | undefined;
  if (!call) throw new Error(`no stream:start sent to ${deviceId}`);
  return call[1].sessionId;
}

function frame(sessionId: string, payload: string): Buffer {
  return Buffer.concat([Buffer.from(sessionId, "utf8"), Buffer.from(payload)]);
}

beforeEach(() => {
  vi.clearAllMocks();
  agents[DEVICE_A.id] = { emit: vi.fn() };
  agents[DEVICE_B.id] = { emit: vi.fn() };
  mockedFindAgentSocket.mockImplementation((deviceId: string) => Promise.resolve(agents[deviceId] as never));
});

afterEach(() => {
  // Sessions live at module scope; end any a test left running.
  streamService.handleAgentDisconnected(DEVICE_A.id);
  streamService.handleAgentDisconnected(DEVICE_B.id);
});

describe("streamService: per-device sessions", () => {
  it("runs independent sessions for different devices, each started on its own agent", async () => {
    await streamService.startViewing(DEVICE_A, "viewer-1");
    await streamService.startViewing(DEVICE_B, "viewer-2");

    expect(sessionIdOf(DEVICE_A.id)).not.toBe(sessionIdOf(DEVICE_B.id));
    expect(mockedState).toHaveBeenCalledWith(DEVICE_A.orgId, DEVICE_A.id, true, sessionIdOf(DEVICE_A.id));
    expect(mockedState).toHaveBeenCalledWith(DEVICE_B.orgId, DEVICE_B.id, true, sessionIdOf(DEVICE_B.id));
  });

  it("relays a device's frames only to that device's viewers", async () => {
    await streamService.startViewing(DEVICE_A, "viewer-1");
    await streamService.startViewing(DEVICE_B, "viewer-2");

    streamService.handleAgentFrame(DEVICE_A.id, frame(sessionIdOf(DEVICE_A.id), "jpeg-a"));

    expect(mockedFrame).toHaveBeenCalledTimes(1);
    expect(mockedFrame).toHaveBeenCalledWith(DEVICE_A.id, Buffer.from("jpeg-a"));
  });

  it("drops a frame that carries another device's session id", async () => {
    await streamService.startViewing(DEVICE_A, "viewer-1");
    await streamService.startViewing(DEVICE_B, "viewer-2");

    // Agent B sending a frame tagged with A's session must not reach anyone.
    streamService.handleAgentFrame(DEVICE_B.id, frame(sessionIdOf(DEVICE_A.id), "spoofed"));

    expect(mockedFrame).not.toHaveBeenCalled();
  });

  it("joins an existing session instead of starting a second one", async () => {
    await streamService.startViewing(DEVICE_A, "viewer-1");
    await streamService.startViewing(DEVICE_A, "viewer-2");

    const starts = agents[DEVICE_A.id].emit.mock.calls.filter(([event]) => event === "stream:start");
    expect(starts).toHaveLength(1);
    expect(streamService.isViewing(DEVICE_A.id, "viewer-2")).toBe(true);
  });

  it("stops a device's agent only when its last viewer leaves, leaving other devices streaming", async () => {
    await streamService.startViewing(DEVICE_A, "viewer-1");
    await streamService.startViewing(DEVICE_A, "viewer-2");
    await streamService.startViewing(DEVICE_B, "viewer-3");

    await streamService.stopViewing(DEVICE_A.id, "viewer-1");
    expect(agents[DEVICE_A.id].emit).not.toHaveBeenCalledWith("stream:stop", expect.anything());

    await streamService.stopViewing(DEVICE_A.id, "viewer-2");
    expect(agents[DEVICE_A.id].emit).toHaveBeenCalledWith("stream:stop", { sessionId: expect.any(String) as string });
    expect(agents[DEVICE_B.id].emit).not.toHaveBeenCalledWith("stream:stop", expect.anything());
    expect(streamService.isViewing(DEVICE_B.id, "viewer-3")).toBe(true);
  });

  it("ignores a stop from a socket that wasn't viewing that device", async () => {
    await streamService.startViewing(DEVICE_A, "viewer-1");

    await streamService.stopViewing(DEVICE_A.id, "someone-else");

    expect(streamService.isViewing(DEVICE_A.id, "viewer-1")).toBe(true);
    expect(agents[DEVICE_A.id].emit).not.toHaveBeenCalledWith("stream:stop", expect.anything());
  });

  it("removes a disconnected viewer from every device it was watching", async () => {
    await streamService.startViewing(DEVICE_A, "viewer-1");
    await streamService.startViewing(DEVICE_B, "viewer-1");

    await streamService.stopViewingEverywhere("viewer-1");

    expect(streamService.isViewing(DEVICE_A.id, "viewer-1")).toBe(false);
    expect(streamService.isViewing(DEVICE_B.id, "viewer-1")).toBe(false);
  });

  it("ends only the disconnected agent's session", async () => {
    await streamService.startViewing(DEVICE_A, "viewer-1");
    await streamService.startViewing(DEVICE_B, "viewer-2");

    streamService.handleAgentDisconnected(DEVICE_A.id);

    expect(mockedState).toHaveBeenCalledWith(DEVICE_A.orgId, DEVICE_A.id, false, null);
    expect(mockedState).not.toHaveBeenCalledWith(DEVICE_B.orgId, DEVICE_B.id, false, null);
    expect(streamService.isViewing(DEVICE_A.id, "viewer-1")).toBe(false);
    expect(streamService.isViewing(DEVICE_B.id, "viewer-2")).toBe(true);
  });

  it("rolls back the session when the agent can't be reached", async () => {
    mockedFindAgentSocket.mockResolvedValue(undefined);

    await expect(streamService.startViewing(DEVICE_A, "viewer-1")).rejects.toThrow();

    expect(streamService.isViewing(DEVICE_A.id, "viewer-1")).toBe(false);
  });
});
