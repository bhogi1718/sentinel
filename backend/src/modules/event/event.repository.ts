import { EventType, Prisma } from "@prisma/client";
import { prisma } from "../../prisma/client";

export const eventRepository = {
  create(params: {
    orgId: string;
    deviceId: string;
    type: EventType;
    metadata?: Record<string, unknown>;
    occurredAt?: Date;
  }) {
    return prisma.event.create({
      data: {
        orgId: params.orgId,
        deviceId: params.deviceId,
        type: params.type,
        metadata: (params.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        occurredAt: params.occurredAt ?? new Date(),
      },
      include: { device: { select: { id: true, name: true } } },
    });
  },

  /// Always scoped to one organization; deviceId and type narrow it further.
  /// A deviceId from another organization simply matches nothing.
  async findMany(params: { orgId: string; page: number; pageSize: number; deviceId?: string; type?: EventType }) {
    const where: Prisma.EventWhereInput = {
      orgId: params.orgId,
      ...(params.deviceId ? { deviceId: params.deviceId } : {}),
      ...(params.type ? { type: params.type } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.event.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: { device: { select: { id: true, name: true } } },
      }),
      prisma.event.count({ where }),
    ]);

    return { items, total };
  },
};
