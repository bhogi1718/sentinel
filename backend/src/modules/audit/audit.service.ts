import { AuditAction } from "@prisma/client";
import { ApiError } from "../../common/ApiError";
import { logger } from "../../config/logger";
import { auditRepository } from "./audit.repository";
import { AuditEntry, AuditSubject } from "./audit.types";
import { ListAuditQuery } from "./audit.validation";

/// What a failed action's entry says went wrong. Only our own API errors
/// are worded for users; anything else is summarized rather than leaking
/// internals into the log.
export function failureReason(err: unknown): string {
  return err instanceof ApiError ? err.message : "Unexpected error";
}

function isEmpty(detail: Record<string, unknown>): boolean {
  return Object.keys(detail).length === 0;
}

export const auditService = {
  /// Writes one entry. Never throws: a failure to write the log is reported
  /// in the server log, and the action it describes - which has already
  /// happened - still returns its result.
  async record(entry: AuditEntry): Promise<void> {
    try {
      await auditRepository.create(entry);
    } catch (err) {
      logger.error(`Failed to write audit entry ${entry.action} for device ${entry.device.id}`, {
        actorId: entry.actor.id,
        outcome: entry.outcome,
        error: err instanceof Error ? err.message : err,
      });
    }
  },

  /// Runs an action and records how it went: SUCCESS with `detail`, or
  /// FAILURE with the reason as well - then returns the action's result or
  /// rethrows its error unchanged.
  async track<T>(
    who: AuditSubject,
    action: AuditAction,
    run: () => Promise<T>,
    detail: Record<string, unknown> = {},
  ): Promise<T> {
    try {
      const result = await run();
      await auditService.record({ ...who, action, outcome: "SUCCESS", detail: isEmpty(detail) ? undefined : detail });
      return result;
    } catch (err) {
      await auditService.record({ ...who, action, outcome: "FAILURE", detail: { ...detail, error: failureReason(err) } });
      throw err;
    }
  },

  async list(orgId: string, query: ListAuditQuery) {
    const { items, total } = await auditRepository.findMany({ orgId, ...query });
    return {
      items,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  },
};
