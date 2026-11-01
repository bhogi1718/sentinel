import { Prisma } from "@prisma/client";
import { prisma } from "../../prisma/client";

/// The conditions under which a code can still be used, at `now`.
function usable(now: Date): Prisma.PairingCodeWhereInput {
  return { usedAt: null, expiresAt: { gt: now } };
}

export const pairingRepository = {
  create(params: { orgId: string; deviceName: string; codeHash: string; createdById: string; expiresAt: Date }) {
    return prisma.pairingCode.create({ data: params, select: { id: true, deviceName: true, expiresAt: true } });
  },

  countPending(orgId: string, now = new Date()) {
    return prisma.pairingCode.count({ where: { orgId, ...usable(now) } });
  },

  /// Forgets this organization's codes that were used or expired more than
  /// `olderThan` ago - nothing reads them after that.
  deleteStale(orgId: string, olderThan: Date) {
    return prisma.pairingCode.deleteMany({
      where: { orgId, OR: [{ usedAt: { lt: olderThan } }, { usedAt: null, expiresAt: { lt: olderThan } }] },
    });
  },

  /// Cancels one of this organization's unused codes. Returns whether one
  /// was cancelled - an id from another organization, or a code already
  /// used, matches nothing.
  async cancel(orgId: string, id: string): Promise<boolean> {
    const { count } = await prisma.pairingCode.deleteMany({ where: { id, orgId, usedAt: null } });
    return count === 1;
  },

  /// A still-usable code by its hash, with its organization and creator.
  findUsable(codeHash: string, now: Date, client: Prisma.TransactionClient) {
    return client.pairingCode.findFirst({
      where: { codeHash, ...usable(now) },
      include: {
        org: { select: { id: true, isDemo: true } },
        createdBy: { select: { id: true, email: true } },
      },
    });
  },

  /// Marks the code used by the device it created, if it still can be.
  /// The conditional update is what makes it single-use: of two agents
  /// presenting the same code at once, the database lets exactly one
  /// change the row.
  async claim(client: Prisma.TransactionClient, id: string, deviceId: string, now: Date): Promise<boolean> {
    const { count } = await client.pairingCode.updateMany({ where: { id, ...usable(now) }, data: { usedAt: now, deviceId } });
    return count === 1;
  },
};
