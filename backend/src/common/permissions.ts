import { OrgRole } from "@prisma/client";

/// Higher rank = more privileged. Every role can do everything the roles
/// below it can.
const ROLE_RANK: Record<OrgRole, number> = {
  VIEWER: 0,
  ADMIN: 1,
  OWNER: 2,
};

/// Each action an organization member can take, mapped to the least
/// privileged role allowed to take it. The single source of truth for
/// authorization: REST routes (requirePermission) and socket handlers both
/// check against this table, and the API hands each member their resolved
/// list so the dashboard can hide controls they can't use.
///
/// File access and screen viewing sit at ADMIN alongside remote commands
/// because they expose the device owner's private data, not just its state.
export const PERMISSIONS = {
  "org:view": "VIEWER",
  "members:view": "VIEWER",
  /// Device list and status, metrics, events, command history.
  "devices:view": "VIEWER",
  "processes:view": "VIEWER",
  "files:access": "ADMIN",
  /// Screenshots, live view and annotations.
  "screen:view": "ADMIN",
  "commands:send": "ADMIN",
  /// Adding devices.
  "devices:manage": "ADMIN",
  "settings:manage": "ADMIN",
  "members:manage": "OWNER",
  "org:manage": "OWNER",
} as const satisfies Record<string, OrgRole>;

export type Permission = keyof typeof PERMISSIONS;

const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function can(role: OrgRole, permission: Permission): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[PERMISSIONS[permission]];
}

export function permissionsFor(role: OrgRole): Permission[] {
  return ALL_PERMISSIONS.filter((permission) => can(role, permission));
}
