import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../modules/organization/organization.repository", () => ({
  organizationRepository: { findMembership: vi.fn() },
}));
vi.mock("../modules/device/device.repository", () => ({
  deviceRepository: { findInOrg: vi.fn() },
}));

import { deviceRepository } from "../modules/device/device.repository";
import { organizationRepository } from "../modules/organization/organization.repository";
import { authorizeDeviceAction } from "./authorizeDeviceAction";

const mockedOrgRepo = vi.mocked(organizationRepository, true);
const mockedDeviceRepo = vi.mocked(deviceRepository, true);

const USER = { id: "user-1", email: "user@example.com" };
const TARGET = { orgId: "org-1", deviceId: "device-1" };
const DEVICE = { id: "device-1", orgId: "org-1", name: "Laptop", isOnline: true, lastSeenAt: null, createdAt: new Date() };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authorizeDeviceAction", () => {
  it("returns the device to a member whose role allows the action", async () => {
    mockedOrgRepo.findMembership.mockResolvedValue({ role: "ADMIN" } as never);
    mockedDeviceRepo.findInOrg.mockResolvedValue(DEVICE);

    // isOnline comes from live presence, not the stored row - and no agent
    // is connected in this test.
    await expect(authorizeDeviceAction(USER, TARGET, "screen:view")).resolves.toEqual({ ...DEVICE, isOnline: false });
    expect(mockedOrgRepo.findMembership).toHaveBeenCalledWith(USER.id, "org-1");
    expect(mockedDeviceRepo.findInOrg).toHaveBeenCalledWith("org-1", "device-1");
  });

  it("refuses a non-member with the same message as an unknown device", async () => {
    mockedOrgRepo.findMembership.mockResolvedValue(null);

    await expect(authorizeDeviceAction(USER, TARGET, "screen:view")).rejects.toThrow("Device not found");
    expect(mockedDeviceRepo.findInOrg).not.toHaveBeenCalled();
  });

  it("refuses a member whose role is too low", async () => {
    mockedOrgRepo.findMembership.mockResolvedValue({ role: "VIEWER" } as never);

    await expect(authorizeDeviceAction(USER, TARGET, "screen:view")).rejects.toThrow(/role/);
    expect(mockedDeviceRepo.findInOrg).not.toHaveBeenCalled();
  });

  it("refuses a device that belongs to a different organization", async () => {
    mockedOrgRepo.findMembership.mockResolvedValue({ role: "OWNER" } as never);
    mockedDeviceRepo.findInOrg.mockResolvedValue(null);

    await expect(authorizeDeviceAction(USER, TARGET, "screen:view")).rejects.toThrow("Device not found");
  });
});
