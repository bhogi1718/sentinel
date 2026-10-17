import { prisma } from "../../prisma/client";
import { OrgDevice } from "./device.types";

// Everything about a device except its token hash - see OrgDevice.
const orgDeviceSelect = {
  id: true,
  orgId: true,
  name: true,
  isOnline: true,
  lastSeenAt: true,
  createdAt: true,
} as const;

export const deviceRepository = {
  /// The device with this id, only if it belongs to this organization.
  findInOrg(orgId: string, deviceId: string): Promise<OrgDevice | null> {
    return prisma.device.findFirst({ where: { id: deviceId, orgId }, select: orgDeviceSelect });
  },

  listForOrg(orgId: string): Promise<OrgDevice[]> {
    return prisma.device.findMany({ where: { orgId }, orderBy: { createdAt: "asc" }, select: orgDeviceSelect });
  },

  findByTokenHash(tokenHash: string) {
    return prisma.device.findUnique({ where: { tokenHash } });
  },

  updateLastSeen(id: string) {
    return prisma.device.update({
      where: { id },
      data: { lastSeenAt: new Date() },
    });
  },

  /// Last-known connection state, kept as a record only - whether a device
  /// is reachable comes from realtime/presence, never from this column.
  setOnlineStatus(id: string, isOnline: boolean) {
    return prisma.device.update({
      where: { id },
      data: { isOnline, ...(isOnline ? { lastSeenAt: new Date() } : {}) },
    });
  },

  create(params: { orgId: string; name: string; tokenHash: string }): Promise<OrgDevice> {
    return prisma.device.create({
      data: { orgId: params.orgId, name: params.name, tokenHash: params.tokenHash },
      select: orgDeviceSelect,
    });
  },
};
