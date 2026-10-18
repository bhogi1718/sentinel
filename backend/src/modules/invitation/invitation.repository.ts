import { OrgRole, Prisma } from "@prisma/client";
import { prisma } from "../../prisma/client";

/// The conditions under which an invite can still be used, at `now`.
function usable(now: Date): Prisma.InvitationWhereInput {
  return { acceptedAt: null, revokedAt: null, expiresAt: { gt: now } };
}

const creator = { select: { id: true, name: true, email: true } } as const;

export const invitationRepository = {
  create(params: { orgId: string; role: OrgRole; tokenHash: string; note?: string; createdById: string; expiresAt: Date }) {
    return prisma.invitation.create({ data: params, include: { createdBy: creator } });
  },

  countPending(orgId: string, now = new Date()) {
    return prisma.invitation.count({ where: { orgId, ...usable(now) } });
  },

  listPending(orgId: string, now = new Date()) {
    return prisma.invitation.findMany({
      where: { orgId, ...usable(now) },
      orderBy: { createdAt: "desc" },
      include: { createdBy: creator },
    });
  },

  /// Revokes a pending invite of this organization and returns it, or null
  /// - an id from another organization, or an invite already used or
  /// revoked, matches nothing.
  async revoke(orgId: string, id: string, now = new Date()) {
    const pending = { id, orgId, acceptedAt: null, revokedAt: null };
    const invitation = await prisma.invitation.findFirst({ where: pending });
    if (!invitation) return null;
    const { count } = await prisma.invitation.updateMany({ where: pending, data: { revokedAt: now } });
    return count === 1 ? invitation : null;
  },

  /// A still-usable invite by its token's hash, with its organization.
  findUsable(tokenHash: string, now = new Date(), client: Prisma.TransactionClient = prisma) {
    return client.invitation.findFirst({
      where: { tokenHash, ...usable(now) },
      include: { org: { select: { id: true, name: true, isDemo: true } } },
    });
  },

  /// Marks the invite used, if it still can be. The conditional update is
  /// what makes it single-use: of two simultaneous accepts, the database
  /// lets exactly one change the row.
  async claim(client: Prisma.TransactionClient, id: string, acceptedById: string, now = new Date()): Promise<boolean> {
    const { count } = await client.invitation.updateMany({
      where: { id, ...usable(now) },
      data: { acceptedAt: now, acceptedById },
    });
    return count === 1;
  },
};
