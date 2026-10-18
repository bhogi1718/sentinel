import { prisma } from "../../prisma/client";

export const organizationRepository = {
  /// Every organization the user belongs to, oldest membership first, with
  /// the user's role in each.
  listMembershipsForUser(userId: string) {
    return prisma.membership.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: { org: { select: { id: true, name: true, slug: true, isDemo: true } } },
    });
  },

  findMembership(userId: string, orgId: string) {
    return prisma.membership.findUnique({
      where: { userId_orgId: { userId, orgId } },
      include: { org: { select: { id: true, name: true, slug: true, isDemo: true } } },
    });
  },

  /// A new organization with the user as its Owner, in one write.
  createWithOwner(userId: string, organization: { name: string; slug: string }) {
    return prisma.organization.create({
      data: { ...organization, memberships: { create: { userId, role: "OWNER" } } },
      select: { id: true, name: true, slug: true, isDemo: true },
    });
  },

  countOwnedBy(userId: string) {
    return prisma.membership.count({ where: { userId, role: "OWNER" } });
  },

  listMembers(orgId: string) {
    return prisma.membership.findMany({
      where: { orgId },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
  },
};
