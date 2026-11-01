import crypto from "crypto";
import { ApiError } from "../../common/ApiError";
import { hashToken } from "../../common/hashToken";
import { prisma } from "../../prisma/client";
import { broadcastDeviceAdded } from "../../realtime/socket";
import { auditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { deviceService } from "../device/device.service";
import { pairingRepository } from "./pairing.repository";

export const PAIRING_CODE_TTL_MINUTES = 15;
/// Unused codes one organization may have at a time.
export const MAX_PENDING_CODES = 20;

/// No 0/O, 1/I/L: a code is read off a screen and typed on another machine.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

/// 8 characters from a 31-letter alphabet (about 40 bits). Guessing one
/// isn't practical: a code lives 15 minutes, works once, and claims are
/// rate-limited per address.
function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return code;
}

/// "K7QM3XRP" -> "K7QM-3XRP", the way codes are shown.
function formatCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/// Every reason a code can't be used - unknown, expired, used, cancelled -
/// gets this same answer.
function codeNotValid(): ApiError {
  return ApiError.notFound("That pairing code isn't valid. It may have expired - create a new one.");
}

export interface PairedDevice {
  deviceId: string;
  deviceName: string;
  token: string;
}

export const pairingService = {
  /// Creates a code for a device named `deviceName`. The code is returned
  /// here and only here - just its hash is stored.
  async create(orgId: string, creator: AuthenticatedUser, deviceName: string) {
    const now = new Date();
    await pairingRepository.deleteStale(orgId, new Date(now.getTime() - 86_400_000));
    if ((await pairingRepository.countPending(orgId, now)) >= MAX_PENDING_CODES) {
      throw ApiError.conflict(`An organization can have at most ${MAX_PENDING_CODES} unused pairing codes`);
    }

    const code = generateCode();
    const pairing = await pairingRepository.create({
      orgId,
      deviceName,
      codeHash: hashToken(code),
      createdById: creator.id,
      expiresAt: new Date(now.getTime() + PAIRING_CODE_TTL_MINUTES * 60_000),
    });
    return { ...pairing, code: formatCode(code) };
  },

  async cancel(orgId: string, pairingCodeId: string): Promise<void> {
    if (!(await pairingRepository.cancel(orgId, pairingCodeId))) throw ApiError.notFound("Pairing code not found");
  },

  /// An agent exchanges a code (already normalized) for a new device and its
  /// token. Claiming the code and creating the device happen in one
  /// transaction, so a code is never used up without a device to show for
  /// it, and never makes two devices.
  async claim(code: string): Promise<PairedDevice> {
    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const pairing = await pairingRepository.findUsable(hashToken(code), now, tx);
      // A code whose creator's account has since been deleted is refused:
      // the new device's audit entry needs someone to attribute it to.
      if (!pairing || pairing.org.isDemo || !pairing.createdBy) throw codeNotValid();

      const { device, token, tokenHash } = deviceService.newDevice(pairing.orgId, pairing.deviceName);
      await tx.device.create({ data: { id: device.id, orgId: device.orgId, name: device.name, tokenHash } });
      if (!(await pairingRepository.claim(tx, pairing.id, device.id, now))) throw codeNotValid();
      return { device, token, pairingCodeId: pairing.id, creator: pairing.createdBy };
    });

    await auditService.record({ actor: result.creator, device: result.device, action: "DEVICE_ADDED", outcome: "SUCCESS" });
    broadcastDeviceAdded(result.device.orgId, result.device.id, result.pairingCodeId);
    return { deviceId: result.device.id, deviceName: result.device.name, token: result.token };
  },
};
