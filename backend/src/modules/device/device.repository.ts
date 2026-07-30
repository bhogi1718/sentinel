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

  create(params: { name: string; tokenHash: string }) {
    return prisma.device.create({
      data: { name: params.name, tokenHash: params.tokenHash },
    });
  },
};
