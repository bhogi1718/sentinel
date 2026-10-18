import { logger } from "../../config/logger";
import { auditRepository } from "./audit.repository";

/// How long audit entries are kept. The public demo keeps its own entries
/// for less (see demo/demoSetup.ts).
export const AUDIT_RETENTION_DAYS = 90;

const PRUNE_EVERY_MS = 60 * 60_000;

export async function pruneAuditLog(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - AUDIT_RETENTION_DAYS * 86_400_000);
  return auditRepository.deleteOlderThan(cutoff);
}

function pruneAndLog(): void {
  pruneAuditLog()
    .then((removed) => {
      if (removed > 0) logger.info(`Removed ${removed} audit entries older than ${AUDIT_RETENTION_DAYS} days`);
    })
    .catch((err: unknown) => {
      logger.error("Failed to prune the audit log", { error: err instanceof Error ? err.message : err });
    });
}

/// Prunes once now, then hourly for as long as the server runs.
export function startAuditRetention(): void {
  pruneAndLog();
  const timer = setInterval(pruneAndLog, PRUNE_EVERY_MS);
  // Never keep the process alive just for this.
  timer.unref();
}
