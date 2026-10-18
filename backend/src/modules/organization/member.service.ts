import { OrgRole, Prisma } from "@prisma/client";
import { ApiError } from "../../common/ApiError";
import { can } from "../../common/permissions";
import { prisma } from "../../prisma/client";
import { resyncDashboardSockets } from "../../realtime/namespaces/dashboardNamespace";
import { auditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { OrgContext } from "./organization.types";

/// Locks the organization's row for the rest of the transaction. Every
/// membership change takes this lock first, so two at once (two owners
/// demoting each other, say) run one after the other, and the last-owner
/// check always sees the other's result.
async function lockOrganization(tx: Prisma.TransactionClient, orgId: string): Promise<void> {
  await tx.$executeRaw`SELECT 1 FROM "organizations" WHERE "id" = ${orgId} FOR UPDATE`;
}

async function findMembership(tx: Prisma.TransactionClient, orgId: string, userId: string) {
  const membership = await tx.membership.findUnique({
    where: { userId_orgId: { userId, orgId } },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  if (!membership) throw ApiError.notFound("Member not found");
  return membership;
}

/// Throws unless the organization keeps at least one owner without this one.
async function assertAnotherOwner(tx: Prisma.TransactionClient, orgId: string, message: string): Promise<void> {
  const owners = await tx.membership.count({ where: { orgId, role: "OWNER" } });
  if (owners <= 1) throw ApiError.conflict(message);
}

export const memberService = {
  /// An owner changes a member's role, their own included. The change
  /// applies to the member's very next request (roles are checked per
  /// request), and their open consoles are re-checked at once - so a demoted
  /// admin's live view ends immediately.
  async changeRole(org: OrgContext, actor: AuthenticatedUser, userId: string, role: OrgRole): Promise<void> {
    const change = await prisma.$transaction(async (tx) => {
      await lockOrganization(tx, org.id);
      const membership = await findMembership(tx, org.id, userId);
      if (membership.role === role) return null;
      if (membership.role === "OWNER") {
        await assertAnotherOwner(tx, org.id, "An organization needs at least one owner. Make someone else an owner first.");
      }
      await tx.membership.update({ where: { id: membership.id }, data: { role } });
      return { member: membership.user, fromRole: membership.role };
    });
    if (!change) return;

    await auditService.record({
      orgId: org.id,
      actor,
      action: "MEMBER_ROLE_CHANGED",
      outcome: "SUCCESS",
      detail: { member: change.member, fromRole: change.fromRole, toRole: role },
    });
    await resyncDashboardSockets(userId);
  },

  /// Removes a member (owners only) or leaves (anyone, for themselves). The
  /// last owner can do neither, and no one can leave the public demo, which
  /// every visitor shares.
  async remove(org: OrgContext, actor: AuthenticatedUser, userId: string): Promise<void> {
    const leaving = userId === actor.id;
    if (org.isDemo) throw ApiError.forbidden("Members can't change in the demo organization");
    if (!leaving && !can(org.role, "members:manage", { isDemo: org.isDemo })) {
      throw ApiError.forbidden("Your role in this organization doesn't allow this action");
    }

    const removed = await prisma.$transaction(async (tx) => {
      await lockOrganization(tx, org.id);
      const membership = await findMembership(tx, org.id, userId);
      if (membership.role === "OWNER") {
        await assertAnotherOwner(
          tx,
          org.id,
          leaving
            ? "You're the only owner. Make someone else an owner before leaving."
            : "An organization needs at least one owner. Make someone else an owner first.",
        );
      }
      await tx.membership.delete({ where: { id: membership.id } });
      return { member: membership.user, role: membership.role };
    });

    await auditService.record({
      orgId: org.id,
      actor,
      action: leaving ? "MEMBER_LEFT" : "MEMBER_REMOVED",
      outcome: "SUCCESS",
      detail: { member: removed.member, role: removed.role },
    });
    await resyncDashboardSockets(userId);
  },
};
