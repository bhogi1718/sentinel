# Audit log

Status: implemented.

Decisions taken: Owners and Admins can read the log, Viewers can't. Entries are kept for 90 days (7 in the public demo). The log records the actions that expose a device owner's private data or change the machine, not routine viewing.

## Goal

An organization's owners and admins can answer "who looked at this laptop, and what did they do?" for the last 90 days, without trusting the person who did it to say so.

## What is recorded

| Action | When it's written | Detail |
| --- | --- | --- |
| `SCREENSHOT_CAPTURED` | After the capture succeeds or fails | the reason, on failure |
| `LIVE_VIEW_STARTED` | When a member starts or joins a device's live view | the reason, on failure |
| `LIVE_VIEW_ENDED` | When that member's view ends, however it ends | `reason` (`STOPPED`, `DASHBOARD_CLOSED`, `ACCESS_REVOKED`, `DEVICE_OFFLINE`) and `durationSeconds` |
| `FILES_LISTED` | After a folder listing | `path` |
| `FILE_DOWNLOADED` | When the download finishes or fails | `path`, and `sizeBytes` or the reason |
| `COMMAND_SENT` | After the command is handed to the agent | `command`, and `pid` / `processName` for an ended process |

Every entry also has the organization, the member (id, plus their email copied at the time), the device (id, plus its name copied at the time), `SUCCESS` or `FAILURE`, and the time.

Not recorded: device status, metrics, process lists, events and command history. Those are routine reads that every member, Viewers included, can see anyway. Requests the API refuses (wrong role, another organization's device) never reach the action, so they leave no entry. Several members watching one live view each get their own start and end.

## Design

- **Table:** `audit_events` (`AuditEvent` in `schema.prisma`), indexed by `(orgId, occurredAt)` for the page and `occurredAt` for retention.
- **Append-only, enforced by the database:** a `BEFORE UPDATE` trigger rejects any change to a row (migration `20261019090000_audit_log`). The one exception is the update Postgres makes itself when the member's account is deleted (`ON DELETE SET NULL` on `actorId`). The repository has no update method either.
- **History outlives what it describes:** `deviceId` has no foreign key and the device name is copied, so deleting a device keeps its entries. Deleting a user sets `actorId` to null and keeps the copied email. Deleting an organization removes its entries along with everything else it owns.
- **Where entries are written:**
  - REST actions are wrapped in `auditService.track()` in their controllers (screenshot, files, commands). Downloads stream, so `file.controller.ts` writes the entry when the stream ends.
  - Live view entries are written by `stream.service.ts`, which now knows the member behind each viewing socket. Every way a viewer leaves (stop, closed tab, revoked access, device offline) goes through it.
- **A failed log write doesn't fail the action.** `auditService.record()` logs the error to the server log instead of throwing. The action has already happened by then, and its result is still returned.
- **Retention:** `modules/audit/auditRetention.ts` deletes entries older than 90 days at startup and then hourly. The demo's own hourly clean-up removes demo entries after 7 days.

## Access

- Permission `audit:view`, at ADMIN (`common/permissions.ts`). It isn't restricted in the demo, so demo visitors (Admins of the demo organization) can see the demo's own log.
- `GET /api/orgs/:orgId/audit` takes `page`, `pageSize` (max 100), `action`, `actorId`, `deviceId`, `from` (inclusive) and `to` (exclusive). It returns newest first, with the member's current name when their account still exists.
- The console shows **Audit log** in the navigation only to roles with `audit:view`. Typing its address as a Viewer shows "Not available for your role", and the API returns 403 regardless.

## Tests

- `src/test/integration/auditLog.test.ts`, a real database, server and simulated agent:
  - each action writes exactly one entry;
  - failures are recorded with their reason;
  - refused requests and routine reads write nothing;
  - Owners and Admins can read, Viewers get 403, and other organizations get 404;
  - filters, the append-only trigger, entries surviving deleted users and devices, and 90-day retention all work.
- `src/modules/stream/stream.service.test.ts` covers live view starts and ends for each viewer and each reason, and a live view that keeps running when the log can't be written.
