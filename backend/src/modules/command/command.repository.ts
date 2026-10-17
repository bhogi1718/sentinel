import { CommandStatus, CommandType, Prisma } from "@prisma/client";
import { prisma } from "../../prisma/client";

const commandInclude = {
  device: { select: { id: true, name: true } },
  requestedBy: { select: { id: true, email: true, name: true } },
} satisfies Prisma.CommandInclude;

export const commandRepository = {
  create(params: {
    orgId: string;
    deviceId: string;
    requestedById: string;
    type: CommandType;
    targetPid?: number;
    targetName?: string;
  }) {
    return prisma.command.create({
      data: {
        orgId: params.orgId,
        deviceId: params.deviceId,
        requestedById: params.requestedById,
        type: params.type,
        targetPid: params.targetPid,
        targetName: params.targetName,
      },
      include: commandInclude,
    });
  },

  async listForDevice(params: { orgId: string; deviceId: string; page: number; pageSize: number }) {
    const where: Prisma.CommandWhereInput = { orgId: params.orgId, deviceId: params.deviceId };

    const [items, total] = await Promise.all([
      prisma.command.findMany({
        where,
        orderBy: { requestedAt: "desc" },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: commandInclude,
      }),
      prisma.command.count({ where }),
    ]);

    return { items, total };
  },

  updateStatus(id: string, status: CommandStatus, errorMessage?: string) {
    return prisma.command.update({
      where: { id },
      data: {
        status,
        errorMessage: errorMessage ?? null,
        ...(status === "ACKNOWLEDGED" || status === "FAILED" ? { acknowledgedAt: new Date() } : {}),
      },
      include: commandInclude,
    });
  },
};
