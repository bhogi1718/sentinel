import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../realtime/socket", () => ({
  findAgentSocket: vi.fn(),
  broadcastCommandUpdate: vi.fn(),
}));

vi.mock("./command.repository", () => ({
  commandRepository: {
    create: vi.fn(),
    updateStatus: vi.fn(),
    listForDevice: vi.fn(),
  },
}));

import { broadcastCommandUpdate, findAgentSocket } from "../../realtime/socket";
import { commandRepository } from "./command.repository";
import { commandService } from "./command.service";
import { ApiError } from "../../common/ApiError";
import { OrgDevice } from "../device/device.types";

const mockedFindAgentSocket = vi.mocked(findAgentSocket, true);
const mockedCommandRepo = vi.mocked(commandRepository, true);

const ONLINE_DEVICE: OrgDevice = {
  id: "device-1",
  orgId: "org-1",
  name: "Laptop",
  isOnline: true,
  lastSeenAt: null,
  createdAt: new Date(),
};
const OFFLINE_DEVICE: OrgDevice = { ...ONLINE_DEVICE, isOnline: false };
const REQUESTER_ID = "user-1";

function agentConnected() {
  const emit = vi.fn();
  mockedFindAgentSocket.mockResolvedValue({ emit } as never);
  mockedCommandRepo.create.mockResolvedValue({ id: "cmd-1" } as never);
  mockedCommandRepo.updateStatus.mockResolvedValue({ id: "cmd-1", status: "SENT" } as never);
  return emit;
}

describe("commandService.sendCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws conflict when the device is offline, without recording a command", async () => {
    await expect(commandService.sendCommand(OFFLINE_DEVICE, { type: "LOCK" }, REQUESTER_ID)).rejects.toThrow(
      ApiError,
    );
    expect(mockedCommandRepo.create).not.toHaveBeenCalled();
  });

  it("throws conflict when the device has no live socket", async () => {
    mockedFindAgentSocket.mockResolvedValue(undefined);

    await expect(commandService.sendCommand(ONLINE_DEVICE, { type: "LOCK" }, REQUESTER_ID)).rejects.toThrow(
      ApiError,
    );
  });

  it("looks up the agent socket of the device it was given", async () => {
    agentConnected();

    await commandService.sendCommand(ONLINE_DEVICE, { type: "LOCK" }, REQUESTER_ID);

    expect(mockedFindAgentSocket).toHaveBeenCalledWith("device-1");
  });

  it("records a simple command against the device's organization and the requester", async () => {
    agentConnected();

    await commandService.sendCommand(ONLINE_DEVICE, { type: "LOCK" }, REQUESTER_ID);

    expect(mockedCommandRepo.create).toHaveBeenCalledWith({
      orgId: "org-1",
      deviceId: "device-1",
      requestedById: REQUESTER_ID,
      type: "LOCK",
    });
  });

  it("creates a KILL_PROCESS command with the target pid and name", async () => {
    agentConnected();

    await commandService.sendCommand(ONLINE_DEVICE, { type: "KILL_PROCESS", pid: 4821, name: "chrome.exe" }, REQUESTER_ID);

    expect(mockedCommandRepo.create).toHaveBeenCalledWith({
      orgId: "org-1",
      deviceId: "device-1",
      requestedById: REQUESTER_ID,
      type: "KILL_PROCESS",
      targetPid: 4821,
      targetName: "chrome.exe",
    });
  });

  it("emits command:execute with the pid/name flattened alongside type, matching the agent's wire format", async () => {
    const emit = agentConnected();

    await commandService.sendCommand(ONLINE_DEVICE, { type: "KILL_PROCESS", pid: 4821, name: "chrome.exe" }, REQUESTER_ID);

    expect(emit).toHaveBeenCalledWith("command:execute", {
      commandId: "cmd-1",
      type: "KILL_PROCESS",
      pid: 4821,
      name: "chrome.exe",
    });
  });
});

describe("commandService: an ack that arrives immediately", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is never overwritten by the SENT status", async () => {
    // The agent acks synchronously, inside the emit itself - the fastest an
    // ack can possibly arrive.
    const emit = vi.fn((_event: string, payload: { commandId: string }) => {
      void commandService.resolveAck("device-1", payload.commandId, true);
    });
    mockedFindAgentSocket.mockResolvedValue({ emit } as never);
    mockedCommandRepo.create.mockResolvedValue({ id: "cmd-fast" } as never);
    mockedCommandRepo.updateStatus.mockImplementation((id, status) => Promise.resolve({ id, orgId: "org-1", status } as never));

    await commandService.sendCommand(ONLINE_DEVICE, { type: "LOCK" }, REQUESTER_ID);
    await vi.waitFor(() => expect(mockedCommandRepo.updateStatus).toHaveBeenCalledTimes(2));

    const statuses = mockedCommandRepo.updateStatus.mock.calls.map(([, status]) => status);
    expect(statuses).toEqual(["SENT", "ACKNOWLEDGED"]);
    const broadcasts = vi.mocked(broadcastCommandUpdate).mock.calls.map(([command]) => (command as { status: string }).status);
    expect(broadcasts).toEqual(["SENT", "ACKNOWLEDGED"]);
  });
});

describe("commandService.resolveAck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts an ack only from the agent of the device the command was sent to", async () => {
    agentConnected();
    await commandService.sendCommand(ONLINE_DEVICE, { type: "LOCK" }, REQUESTER_ID);
    mockedCommandRepo.updateStatus.mockClear();
    mockedCommandRepo.updateStatus.mockResolvedValue({ id: "cmd-1", orgId: "org-1", status: "ACKNOWLEDGED" } as never);

    await commandService.resolveAck("device-other", "cmd-1", true);
    expect(mockedCommandRepo.updateStatus).not.toHaveBeenCalled();

    await commandService.resolveAck("device-1", "cmd-1", true);
    expect(mockedCommandRepo.updateStatus).toHaveBeenCalledWith("cmd-1", "ACKNOWLEDGED", undefined);
  });
});

describe("commandService.listForDevice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries only the given device within its organization and paginates", async () => {
    mockedCommandRepo.listForDevice.mockResolvedValue({ items: [], total: 51 });

    const result = await commandService.listForDevice(ONLINE_DEVICE, { page: 2, pageSize: 25 });

    expect(mockedCommandRepo.listForDevice).toHaveBeenCalledWith({
      orgId: "org-1",
      deviceId: "device-1",
      page: 2,
      pageSize: 25,
    });
    expect(result.pagination).toEqual({ page: 2, pageSize: 25, total: 51, totalPages: 3 });
  });
});
