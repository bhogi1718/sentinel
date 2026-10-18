import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "../../prisma/client";
import { AuditEntry } from "./audit.types";

// Deliberately no update method: the log is append-only, and the database
// enforces it too (see the audit_log migration).

export const auditRepository = {
  create(entry: AuditEntry) {
    return prisma.auditEvent.create({
      data: {
        orgId: entry.device ? entry.device.orgId : entry.orgId,
        actorId: entry.actor.id,
        actorEmail: entry.actor.email,
        action: entry.action,
        outcome: entry.outcome,
        deviceId: entry.device?.id,
        deviceName: entry.device?.name,
        detail: (entry.detail ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    });
  },

  /// Always scoped to one organization; the other filters narrow it further.
  async findMany(params: {
    orgId: string;
    page: number;
    pageSize: number;
    action?: AuditAction;
    actorId?: string;
    deviceId?: string;
    from?: Date;
    to?: Date;
  }) {
    const where: Prisma.AuditEventWhereInput = {
      orgId: params.orgId,
      ...(params.action ? { action: params.action } : {}),
      ...(params.actorId ? { actorId: params.actorId } : {}),
      ...(params.deviceId ? { deviceId: params.deviceId } : {}),
      ...(params.from || params.to ? { occurredAt: { gte: params.from, lt: params.to } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.auditEvent.findMany({
        where,
        // id breaks ties between entries written in the same millisecond, so
        // pages never overlap or skip.
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: { actor: { select: { id: true, name: true, email: true } } },
      }),
      prisma.auditEvent.count({ where }),
    ]);

    return { items, total };
  },

  async deleteOlderThan(cutoff: Date, orgId?: string): Promise<number> {
    const { count } = await prisma.auditEvent.deleteMany({
      where: { occurredAt: { lt: cutoff }, ...(orgId ? { orgId } : {}) },
    });
    return count;
  },
};
