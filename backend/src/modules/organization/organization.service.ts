import { OrgRole } from "@prisma/client";
import { permissionsFor } from "../../common/permissions";
import { organizationRepository } from "./organization.repository";
import { OrgContext, OrganizationForMember, OrganizationMember } from "./organization.types";

function toOrganizationForMember(
  org: { id: string; name: string; slug: string },
  role: OrgRole,
): OrganizationForMember {
  return { id: org.id, name: org.name, slug: org.slug, role, permissions: permissionsFor(role) };
}

export const organizationService = {
  async listForUser(userId: string): Promise<OrganizationForMember[]> {
    const memberships = await organizationRepository.listMembershipsForUser(userId);
    return memberships.map((membership) => toOrganizationForMember(membership.org, membership.role));
  },

  /// The organization as orgContext already resolved it for this request -
  /// no further lookup needed.
  forMember(org: OrgContext): OrganizationForMember {
    return toOrganizationForMember(org, org.role);
  },

  async listMembers(orgId: string): Promise<OrganizationMember[]> {
    const memberships = await organizationRepository.listMembers(orgId);
    return memberships.map((membership) => ({
      userId: membership.user.id,
      email: membership.user.email,
      name: membership.user.name,
      role: membership.role,
      joinedAt: membership.createdAt,
    }));
  },
};
