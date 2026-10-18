import { apiClient } from "./client";
import { orgPath } from "./paths";

export type OrgRole = "VIEWER" | "ADMIN" | "OWNER";

/// Every permission the backend's table defines (backend/src/common/permissions.ts).
/// The API resolves each member's list, so the dashboard never re-derives
/// what a role can do - it only checks membership in that list. A backend
/// test (permissions.sync.test.ts) fails if this list and the backend's
/// table ever differ.
export const PERMISSIONS = [
  "org:view",
  "members:view",
  "devices:view",
  "processes:view",
  "files:access",
  "screen:view",
  "commands:send",
  "devices:manage",
  "settings:manage",
  "audit:view",
  "members:manage",
  "org:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export interface Organization {
  id: string;
  name: string;
  slug: string;
  /// The public demo organization: its devices are simulated.
  isDemo: boolean;
  role: OrgRole;
  permissions: Permission[];
}

export interface OrganizationMember {
  userId: string;
  email: string;
  name: string | null;
  role: OrgRole;
  joinedAt: string;
}

export const organizationApi = {
  async list(): Promise<Organization[]> {
    const response = await apiClient.get<{ success: true; data: Organization[] }>("/orgs");
    return response.data.data;
  },

  /// Creates an organization with the caller as its Owner.
  async create(name: string): Promise<Organization> {
    const response = await apiClient.post<{ success: true; data: Organization }>("/orgs", { name });
    return response.data.data;
  },

  async changeMemberRole(orgId: string, userId: string, role: OrgRole): Promise<void> {
    await apiClient.patch(`${orgPath(orgId)}/members/${encodeURIComponent(userId)}`, { role });
  },

  /// Removes a member - or, with the caller's own id, leaves.
  async removeMember(orgId: string, userId: string): Promise<void> {
    await apiClient.delete(`${orgPath(orgId)}/members/${encodeURIComponent(userId)}`);
  },

  async listMembers(orgId: string): Promise<OrganizationMember[]> {
    const response = await apiClient.get<{ success: true; data: OrganizationMember[] }>(`${orgPath(orgId)}/members`);
    return response.data.data;
  },
};
