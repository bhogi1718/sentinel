import crypto from "crypto";
import { presence } from "../../realtime/presence";
import { deviceRepository } from "./device.repository";
import { AuthenticatedDevice, OrgDevice } from "./device.types";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

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
};
