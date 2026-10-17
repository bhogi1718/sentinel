import { prisma } from "../../prisma/client";

export const organizationRepository = {
  /// Every organization the user belongs to, oldest membership first, with
  /// the user's role in each.
  listMembershipsForUser(userId: string) {
    return prisma.membership.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: { org: { select: { id: true, name: true, slug: true } } },
    });
  },

  findMembership(userId: string, orgId: string) {
    return prisma.membership.findUnique({
      where: { userId_orgId: { userId, orgId } },
      include: { org: { select: { id: true, name: true, slug: true } } },
    });
  },

  listMembers(orgId: string) {
    return prisma.membership.findMany({
      where: { orgId },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
  },
};
