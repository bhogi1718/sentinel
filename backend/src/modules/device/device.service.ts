import crypto from "crypto";
import { ApiError } from "../../common/ApiError";
import { hashToken } from "../../common/hashToken";
import { presence } from "../../realtime/presence";
import { broadcastDeviceRemoved, disconnectAgent } from "../../realtime/socket";
import { auditService } from "../audit/audit.service";
import { AuditActor } from "../audit/audit.types";
import { streamService } from "../stream/stream.service";
import { deviceRepository } from "./device.repository";
import { AuthenticatedDevice, OrgDevice } from "./device.types";

function generateToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

/// A device's online state is whether its agent is connected right now (see
/// realtime/presence), not the stored last-known flag.
function withPresence(device: OrgDevice): OrgDevice {
  return { ...device, isOnline: presence.isConnected(device.id) };
}

export const deviceService = {
  hashToken,
  generateToken,

  async authenticate(token: string): Promise<AuthenticatedDevice | null> {
    const device = await deviceRepository.findByTokenHash(hashToken(token));
    if (!device) {
      return null;
    }
    return { id: device.id, orgId: device.orgId, name: device.name };
  },

  async listForOrg(orgId: string): Promise<OrgDevice[]> {
    return (await deviceRepository.listForOrg(orgId)).map(withPresence);
  },

  /// The device with this id, only if it belongs to this organization.
  async findInOrg(orgId: string, deviceId: string): Promise<OrgDevice | null> {
    const device = await deviceRepository.findInOrg(orgId, deviceId);
    return device ? withPresence(device) : null;
  },

  /// Registers a new device in the organization and returns its agent
  /// token. Only the hash is stored, so this is the one and only time the
  /// token is ever available.
  async create(orgId: string, name: string): Promise<{ device: OrgDevice; token: string }> {
    const token = generateToken();
    const device = await deviceRepository.create({ orgId, name, tokenHash: hashToken(token) });
    return { device: withPresence(device), token };
  },

  /// Removes a device for good: its row (and with it its token, events and
  /// commands) is deleted first, so the agent can't reconnect; then its live
  /// view is ended, its connected agent is cut off, and the organization's
  /// open consoles are told. The audit entry keeps the device's name.
  async remove(device: OrgDevice, actor: AuditActor): Promise<void> {
    const subject = { actor, device: { id: device.id, orgId: device.orgId, name: device.name } };
    await auditService.track(subject, "DEVICE_REMOVED", async () => {
      if (!(await deviceRepository.delete(device.orgId, device.id))) {
        throw ApiError.notFound("Device not found");
      }
    });

    streamService.endSession(device.id, "DEVICE_REMOVED");
    disconnectAgent(device.id);
    broadcastDeviceRemoved(device.orgId, device.id);
  },
};
