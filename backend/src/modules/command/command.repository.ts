import { CommandStatus, CommandType } from "@prisma/client";
import { prisma } from "../../prisma/client";

export const commandRepository = {
  create(params: { deviceId: string; type: CommandType; targetPid?: number; targetName?: string }) {
    return prisma.command.create({
      data: {
        deviceId: params.deviceId,
        type: params.type,
        targetPid: params.targetPid,
        targetName: params.targetName,
      },
      include: { device: { select: { id: true, name: true } } },
    });
  },

  findById(id: string) {
    return prisma.command.findUnique({ where: { id } });
  },

  updateStatus(id: string, status: CommandStatus, errorMessage?: string) {
    return prisma.command.update({
      where: { id },
      data: {
        status,
        errorMessage: errorMessage ?? null,
        ...(status === "ACKNOWLEDGED" || status === "FAILED" ? { acknowledgedAt: new Date() } : {}),
      },
      include: { device: { select: { id: true, name: true } } },
    });
  },
};
