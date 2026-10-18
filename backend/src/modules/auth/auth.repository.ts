import { prisma } from "../../prisma/client";

export const authRepository = {
  /// Emails match regardless of case. New accounts are stored in lowercase,
  /// but older ones may not be, so an exact match is tried first.
  async findUserByEmail(email: string) {
    return (
      (await prisma.user.findUnique({ where: { email } })) ??
      prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } })
    );
  },

  /// A new account and its first organization, with the account as Owner -
  /// one nested write, so it all exists or none of it does.
  createUserWithOrganization(params: {
    email: string;
    name: string;
    passwordHash: string;
    organization: { name: string; slug: string };
  }) {
    return prisma.user.create({
      data: {
        email: params.email,
        name: params.name,
        passwordHash: params.passwordHash,
        memberships: { create: { role: "OWNER", org: { create: params.organization } } },
      },
      select: { id: true, email: true },
    });
  },

  findUserById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },

  updatePasswordHash(id: string, passwordHash: string) {
    return prisma.user.update({
      where: { id },
      data: { passwordHash },
    });
  },

  createRefreshToken(params: { userId: string; tokenHash: string; expiresAt: Date }) {
    return prisma.refreshToken.create({
      data: {
        userId: params.userId,
        tokenHash: params.tokenHash,
        expiresAt: params.expiresAt,
      },
    });
  },

  findRefreshTokenByHash(tokenHash: string) {
    return prisma.refreshToken.findUnique({ where: { tokenHash } });
  },

  revokeRefreshToken(id: string) {
    return prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  },

  revokeAllRefreshTokensForUser(userId: string) {
    return prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },
};
