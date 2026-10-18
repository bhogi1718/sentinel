import { OrgRole } from "@prisma/client";
import crypto from "crypto";
import { ApiError } from "../../common/ApiError";
import { hashToken } from "../../common/hashToken";
import { isDemoUser } from "../../demo/demoSetup";
import { prisma } from "../../prisma/client";
import { resyncDashboardSockets } from "../../realtime/namespaces/dashboardNamespace";
import { auditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { invitationRepository } from "./invitation.repository";
import { CreateInvitationInput } from "./invitation.validation";

export const INVITE_TTL_DAYS = 7;
/// Pending invites one organization may have at a time.
export const MAX_PENDING_INVITES = 50;

/// Every reason an invite can't be used - unknown, expired, used, revoked -
/// gets this same answer, so a link reveals nothing about why.
function inviteNoLongerValid(): ApiError {
  return ApiError.notFound("This invite is no longer valid");
}

/// How an invite is shown to the organization's owners. The token itself
/// is never stored, so it can't be shown again after creation.
function toPendingInvitation(invitation: {
  id: string;
  role: OrgRole;
  note: string | null;
  createdAt: Date;
  expiresAt: Date;
  createdBy: { id: string; name: string | null; email: string } | null;
}) {
  return {
    id: invitation.id,
    role: invitation.role,
    note: invitation.note,
    createdAt: invitation.createdAt,
    expiresAt: invitation.expiresAt,
    createdBy: invitation.createdBy,
  };
}

export type PendingInvitation = ReturnType<typeof toPendingInvitation>;

export interface NewAccount {
  email: string;
  name: string;
  passwordHash: string;
}

function recordJoined(orgId: string, user: AuthenticatedUser, role: OrgRole): Promise<void> {
  return auditService.record({ orgId, actor: user, action: "MEMBER_JOINED", outcome: "SUCCESS", detail: { role } });
}

export const invitationService = {
  /// Creates an invite link. The token is returned here and only here.
  async create(orgId: string, creator: AuthenticatedUser, input: CreateInvitationInput) {
    if ((await invitationRepository.countPending(orgId)) >= MAX_PENDING_INVITES) {
      throw ApiError.conflict(`An organization can have at most ${MAX_PENDING_INVITES} pending invites`);
    }

    const token = crypto.randomBytes(32).toString("base64url");
    const invitation = await invitationRepository.create({
      orgId,
      role: input.role,
      tokenHash: hashToken(token),
      note: input.note || undefined,
      createdById: creator.id,
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
    });
    await auditService.record({
      orgId,
      actor: creator,
      action: "MEMBER_INVITED",
      outcome: "SUCCESS",
      detail: { role: invitation.role, note: invitation.note },
    });
    return { invitation: toPendingInvitation(invitation), token };
  },

  async listPending(orgId: string): Promise<PendingInvitation[]> {
    return (await invitationRepository.listPending(orgId)).map(toPendingInvitation);
  },

  async revoke(orgId: string, actor: AuthenticatedUser, invitationId: string): Promise<void> {
    const invitation = await invitationRepository.revoke(orgId, invitationId);
    if (!invitation) throw ApiError.notFound("Invite not found");
    await auditService.record({
      orgId,
      actor,
      action: "INVITE_REVOKED",
      outcome: "SUCCESS",
      detail: { role: invitation.role, note: invitation.note },
    });
  },

  /// What a link offers, for the page shown before accepting: the
  /// organization's name and the role, nothing more.
  async lookup(token: string): Promise<{ organizationName: string; role: OrgRole }> {
    const invitation = await invitationRepository.findUsable(hashToken(token));
    if (!invitation || invitation.org.isDemo) throw inviteNoLongerValid();
    return { organizationName: invitation.org.name, role: invitation.role };
  },

  /// Joins a signed-in user to the invite's organization. Someone who is
  /// already a member is simply sent there, and the invite stays unused for
  /// whoever it was really meant for.
  async accept(user: AuthenticatedUser, token: string): Promise<{ orgId: string; alreadyMember: boolean }> {
    // The shared demo account belongs to the demo organization only.
    if (isDemoUser(user.email)) throw ApiError.forbidden("The demo account can't join organizations");

    const result = await prisma.$transaction(async (tx) => {
      const invitation = await invitationRepository.findUsable(hashToken(token), new Date(), tx);
      if (!invitation || invitation.org.isDemo) throw inviteNoLongerValid();

      const isMember = () => tx.membership.findUnique({ where: { userId_orgId: { userId: user.id, orgId: invitation.orgId } } });
      if (await isMember()) return { orgId: invitation.orgId, joinedAs: null };

      if (!(await invitationRepository.claim(tx, invitation.id, user.id))) {
        // Lost a race - to another person, or to this user's own second click.
        if (await isMember()) return { orgId: invitation.orgId, joinedAs: null };
        throw inviteNoLongerValid();
      }
      await tx.membership.create({ data: { userId: user.id, orgId: invitation.orgId, role: invitation.role } });
      return { orgId: invitation.orgId, joinedAs: invitation.role };
    });

    if (!result.joinedAs) return { orgId: result.orgId, alreadyMember: true };
    await recordJoined(result.orgId, user, result.joinedAs);
    await resyncDashboardSockets(user.id);
    return { orgId: result.orgId, alreadyMember: false };
  },

  /// Creates an account that joins the invite's organization instead of
  /// getting one of its own - all in one transaction, so a link that turns
  /// out to be used or expired leaves no account behind.
  async acceptWithNewAccount(token: string, account: NewAccount): Promise<AuthenticatedUser> {
    const { user, orgId, role } = await prisma.$transaction(async (tx) => {
      const invitation = await invitationRepository.findUsable(hashToken(token), new Date(), tx);
      if (!invitation || invitation.org.isDemo) throw inviteNoLongerValid();

      const user = await tx.user.create({ data: account, select: { id: true, email: true } });
      if (!(await invitationRepository.claim(tx, invitation.id, user.id))) throw inviteNoLongerValid();
      await tx.membership.create({ data: { userId: user.id, orgId: invitation.orgId, role: invitation.role } });
      return { user, orgId: invitation.orgId, role: invitation.role };
    });
    await recordJoined(orgId, user, role);
    return user;
  },
};
