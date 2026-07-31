import { logger } from "../../config/logger";
import { prisma } from "../../prisma/client";

export const deviceRepository = {
  findByTokenHash(tokenHash: string) {
    return prisma.device.findUnique({ where: { tokenHash } });
  },

  findById(id: string) {
    return prisma.device.findUnique({ where: { id } });
  },

  updateLastSeen(id: string) {
    return prisma.device.update({
      where: { id },
      data: { lastSeenAt: new Date() },
    });
  },

  async setOnlineStatus(id: string, isOnline: boolean) {
    logger.info(`[DEBUG] setOnlineStatus called`, { id, isOnline });
    const result = await prisma.device.update({
      where: { id },
      data: { isOnline, ...(isOnline ? { lastSeenAt: new Date() } : {}) },
    });
    logger.info(`[DEBUG] setOnlineStatus result`, { result });
    return result;
  },

  findFirst() {
    return prisma.device.findFirst();
  },

  create(params: { name: string; tokenHash: string }) {
    return prisma.device.create({
      data: { name: params.name, tokenHash: params.tokenHash },
    });
  },
};
