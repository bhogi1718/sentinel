import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../device/device.repository", () => ({
  deviceRepository: {
    findFirst: vi.fn(),
  },
}));

vi.mock("../../realtime/socket", () => ({
  findAgentSocket: vi.fn(),
  broadcastCommandUpdate: vi.fn(),
}));

vi.mock("./command.repository", () => ({
  commandRepository: {
    create: vi.fn(),
    updateStatus: vi.fn(),
  },
}));

import { deviceRepository } from "../device/device.repository";
import { findAgentSocket } from "../../realtime/socket";
import { commandRepository } from "./command.repository";
import { commandService } from "./command.service";
import { ApiError } from "../../common/ApiError";

const mockedDeviceRepo = vi.mocked(deviceRepository, true);
const mockedFindAgentSocket = vi.mocked(findAgentSocket, true);
const mockedCommandRepo = vi.mocked(commandRepository, true);

const ONLINE_DEVICE = { id: "device-1", isOnline: true } as never;

describe("commandService.sendCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws not found when no device has been registered", async () => {
    mockedDeviceRepo.findFirst.mockResolvedValue(null);

    await expect(commandService.sendCommand({ type: "LOCK" })).rejects.toThrow(ApiError);
  });

  it("throws conflict when the device is offline", async () => {
    mockedDeviceRepo.findFirst.mockResolvedValue({ id: "device-1", isOnline: false } as never);

    await expect(commandService.sendCommand({ type: "LOCK" })).rejects.toThrow(ApiError);
  });

  it("throws conflict when the device has no live socket", async () => {
    mockedDeviceRepo.findFirst.mockResolvedValue(ONLINE_DEVICE);
    mockedFindAgentSocket.mockResolvedValue(undefined);

    await expect(commandService.sendCommand({ type: "LOCK" })).rejects.toThrow(ApiError);
  });

  it("creates a simple command with no target fields", async () => {
    mockedDeviceRepo.findFirst.mockResolvedValue(ONLINE_DEVICE);
    const emit = vi.fn();
    mockedFindAgentSocket.mockResolvedValue({ emit } as never);
    mockedCommandRepo.create.mockResolvedValue({ id: "cmd-1" } as never);
    mockedCommandRepo.updateStatus.mockResolvedValue({ id: "cmd-1", status: "SENT" } as never);

    await commandService.sendCommand({ type: "LOCK" });

    expect(mockedCommandRepo.create).toHaveBeenCalledWith({ deviceId: "device-1", type: "LOCK" });
  });

  it("creates a KILL_PROCESS command with the target pid and name", async () => {
    mockedDeviceRepo.findFirst.mockResolvedValue(ONLINE_DEVICE);
    const emit = vi.fn();
    mockedFindAgentSocket.mockResolvedValue({ emit } as never);
    mockedCommandRepo.create.mockResolvedValue({ id: "cmd-1" } as never);
    mockedCommandRepo.updateStatus.mockResolvedValue({ id: "cmd-1", status: "SENT" } as never);

    await commandService.sendCommand({ type: "KILL_PROCESS", pid: 4821, name: "chrome.exe" });

    expect(mockedCommandRepo.create).toHaveBeenCalledWith({
      deviceId: "device-1",
      type: "KILL_PROCESS",
      targetPid: 4821,
      targetName: "chrome.exe",
    });
  });

  it("emits command:execute with the pid/name flattened alongside type, matching the agent's wire format", async () => {
    mockedDeviceRepo.findFirst.mockResolvedValue(ONLINE_DEVICE);
    const emit = vi.fn();
    mockedFindAgentSocket.mockResolvedValue({ emit } as never);
    mockedCommandRepo.create.mockResolvedValue({ id: "cmd-1" } as never);
    mockedCommandRepo.updateStatus.mockResolvedValue({ id: "cmd-1", status: "SENT" } as never);

    await commandService.sendCommand({ type: "KILL_PROCESS", pid: 4821, name: "chrome.exe" });

    expect(emit).toHaveBeenCalledWith("command:execute", {
      commandId: "cmd-1",
      type: "KILL_PROCESS",
      pid: 4821,
      name: "chrome.exe",
    });
  });
});
