import { createContext } from "react";
import type { Organization, Permission } from "@/api/organization.api";

export interface OrgContextValue {
  /// The organization in the URL - always one the user belongs to.
  org: Organization;
  /// Every organization the user belongs to, for the switcher.
  organizations: Organization[];
  /// Whether the user's role here allows an action. For hiding and
  /// disabling controls only; the API enforces the same rules regardless.
  can: (permission: Permission) => boolean;
}

export const OrgContext = createContext<OrgContextValue | undefined>(undefined);
