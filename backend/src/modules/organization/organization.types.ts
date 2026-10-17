import { OrgRole } from "@prisma/client";
import { Permission } from "../../common/permissions";

/// The organization a request is acting in and the caller's role in it,
/// attached by orgContext from a single membership lookup.
export interface OrgContext {
  id: string;
  name: string;
  slug: string;
  /// The public demo organization - see common/permissions.ts for what it restricts.
  isDemo: boolean;
  role: OrgRole;
}

/// An organization as seen by one of its members.
export interface OrganizationForMember {
  id: string;
  name: string;
  slug: string;
  isDemo: boolean;
  role: OrgRole;
  permissions: Permission[];
}

export interface OrganizationMember {
  userId: string;
  email: string;
  name: string | null;
  role: OrgRole;
  joinedAt: Date;
}
