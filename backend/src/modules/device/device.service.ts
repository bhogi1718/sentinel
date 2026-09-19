import crypto from "crypto";
import { deviceRepository } from "./device.repository";
import { AuthenticatedDevice } from "./device.types";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export const deviceService = {
  hashToken,

  generateToken(): string {
    return crypto.randomBytes(48).toString("hex");
  },

  async authenticate(token: string): Promise<AuthenticatedDevice | null> {
    const device = await deviceRepository.findByTokenHash(hashToken(token));
    if (!device) {
      return null;
    }
    return { id: device.id, name: device.name };
  },
};
