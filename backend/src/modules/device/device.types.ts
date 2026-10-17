export interface AuthenticatedDevice {
  id: string;
  orgId: string;
  name: string;
}

/// A device as handled inside an organization-scoped request. Deliberately
/// excludes tokenHash, which never needs to leave the agent auth path.
export interface OrgDevice {
  id: string;
  orgId: string;
  name: string;
  isOnline: boolean;
  lastSeenAt: Date | null;
  createdAt: Date;
}
