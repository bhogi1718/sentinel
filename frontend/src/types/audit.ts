export type AuditAction =
  | "SCREENSHOT_CAPTURED"
  | "LIVE_VIEW_STARTED"
  | "LIVE_VIEW_ENDED"
  | "FILES_LISTED"
  | "FILE_DOWNLOADED"
  | "COMMAND_SENT";

export type AuditOutcome = "SUCCESS" | "FAILURE";

/// One entry of an organization's audit log. The actor's email and the
/// device's name are as they were at the time; `actor` is null once that
/// person's account no longer exists.
export interface AuditEntry {
  id: string;
  action: AuditAction;
  outcome: AuditOutcome;
  actorEmail: string;
  actor: { id: string; name: string | null; email: string } | null;
  deviceId: string | null;
  deviceName: string | null;
  detail: Record<string, unknown> | null;
  occurredAt: string;
}

export interface PaginatedAuditEntries {
  items: AuditEntry[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
