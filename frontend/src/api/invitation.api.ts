import type { OrgRole } from "./organization.api";
import { apiClient } from "./client";
import { orgPath } from "./paths";

export type InvitableRole = Exclude<OrgRole, "OWNER">;

export interface PendingInvitation {
  id: string;
  role: InvitableRole;
  note: string | null;
  createdAt: string;
  expiresAt: string;
  createdBy: { id: string; name: string | null; email: string } | null;
}

export interface InviteOffer {
  organizationName: string;
  role: InvitableRole;
}

export const invitationApi = {
  async list(orgId: string): Promise<PendingInvitation[]> {
    const response = await apiClient.get<{ success: true; data: PendingInvitation[] }>(`${orgPath(orgId)}/invites`);
    return response.data.data;
  },

  /// The link's token comes back here only - it isn't stored, so it can't
  /// be shown again later.
  async create(orgId: string, role: InvitableRole, note?: string): Promise<{ token: string; invitation: PendingInvitation }> {
    const response = await apiClient.post<{ success: true; data: { token: string; invitation: PendingInvitation } }>(
      `${orgPath(orgId)}/invites`,
      { role, note: note || undefined },
    );
    return response.data.data;
  },

  async revoke(orgId: string, invitationId: string): Promise<void> {
    await apiClient.delete(`${orgPath(orgId)}/invites/${encodeURIComponent(invitationId)}`);
  },

  async lookup(token: string): Promise<InviteOffer> {
    const response = await apiClient.get<{ success: true; data: InviteOffer }>(`/invites/${encodeURIComponent(token)}`);
    return response.data.data;
  },

  async accept(token: string): Promise<{ orgId: string; alreadyMember: boolean }> {
    const response = await apiClient.post<{ success: true; data: { orgId: string; alreadyMember: boolean } }>(
      `/invites/${encodeURIComponent(token)}/accept`,
    );
    return response.data.data;
  },
};
