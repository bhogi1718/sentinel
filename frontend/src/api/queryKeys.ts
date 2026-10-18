import type { ListAuditParams } from "./audit.api";
import type { ListEventsParams } from "./events.api";

/// TanStack Query keys, defined once so the socket handlers that patch the
/// cache and the hooks that read it can never drift apart. Everything
/// tenant-specific is keyed by its organization or device id, so data from
/// one organization can never be served from another's cache entry.
export const queryKeys = {
  organizations: ["organizations"] as const,
  organization: (orgId: string) => ["organizations", orgId] as const,
  members: (orgId: string) => ["organizations", orgId, "members"] as const,
  invitations: (orgId: string) => ["organizations", orgId, "invitations"] as const,
  invite: (token: string) => ["invite", token] as const,
  integrations: (orgId: string) => ["organizations", orgId, "integrations"] as const,

  devices: (orgId: string) => ["devices", orgId] as const,
  device: (deviceId: string) => ["device", deviceId] as const,
  metrics: (deviceId: string) => ["device", deviceId, "metrics"] as const,
  processes: (deviceId: string) => ["device", deviceId, "processes"] as const,
  files: (deviceId: string, path: string) => ["device", deviceId, "files", path] as const,
  commands: (deviceId: string) => ["device", deviceId, "commands"] as const,
  command: (commandId: string) => ["command", commandId] as const,

  /// Prefix for every event list of an organization (all pages and filters).
  events: (orgId: string) => ["events", orgId] as const,
  eventsPage: (orgId: string, params: ListEventsParams) => ["events", orgId, params] as const,

  auditPage: (orgId: string, params: ListAuditParams) => ["audit", orgId, params] as const,
};
