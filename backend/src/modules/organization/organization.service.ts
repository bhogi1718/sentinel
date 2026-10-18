import { OrgRole } from "@prisma/client";
import { ApiError } from "../../common/ApiError";
import { permissionsFor } from "../../common/permissions";
import { isDemoUser } from "../../demo/demoSetup";
import { resyncDashboardSockets } from "../../realtime/namespaces/dashboardNamespace";
import { AuthenticatedUser } from "../auth/auth.types";
import { organizationRepository } from "./organization.repository";
import { organizationSlug } from "./organization.slug";
import { OrgContext, OrganizationForMember, OrganizationMember } from "./organization.types";

function toOrganizationForMember(
  org: { id: string; name: string; slug: string; isDemo: boolean },
  role: OrgRole,
): OrganizationForMember {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    isDemo: org.isDemo,
    role,
    permissions: permissionsFor(role, { isDemo: org.isDemo }),
  };
}

/// How many organizations one user may own - a free-tier guard against a
/// single account creating them without end.
export const MAX_OWNED_ORGANIZATIONS = 10;

export const organizationService = {
  async create(user: AuthenticatedUser, name: string): Promise<OrganizationForMember> {
    // The shared demo account belongs to the demo organization only.
    if (isDemoUser(user.email)) {
      throw ApiError.forbidden("The demo account can't create organizations");
    }
    if ((await organizationRepository.countOwnedBy(user.id)) >= MAX_OWNED_ORGANIZATIONS) {
      throw ApiError.conflict(`You can own at most ${MAX_OWNED_ORGANIZATIONS} organizations`);
    }

    const org = await organizationRepository.createWithOwner(user.id, { name, slug: organizationSlug(name) });
    // Put the user's open consoles in the new organization's room now,
    // rather than at the next periodic resync.
    await resyncDashboardSockets(user.id);
    return toOrganizationForMember(org, "OWNER");
  },

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
