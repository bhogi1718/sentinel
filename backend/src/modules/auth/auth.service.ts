import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../../config/env";
import { ApiError } from "../../common/ApiError";
import { authRepository } from "./auth.repository";
import { AuthenticatedUser, AuthTokens, JwtAccessPayload, JwtRefreshPayload } from "./auth.types";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function parseExpiryToDate(expiresIn: string): Date {
  const match = /^(\d+)([smhd])$/.exec(expiresIn);
  if (!match) {
    throw new Error(`Invalid duration format: ${expiresIn}`);
  }
  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return new Date(Date.now() + amount * multipliers[unit]);
}

const JWT_ALGORITHM = "HS256" as const;

// Matches prisma/seed.ts's SALT_ROUNDS - the initial admin password and any
// later password change should cost the same to brute-force.
const BCRYPT_COST = 12;

function isJwtAccessPayload(payload: unknown): payload is JwtAccessPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    (payload as Record<string, unknown>).type === "access" &&
    typeof (payload as Record<string, unknown>).sub === "string" &&
    typeof (payload as Record<string, unknown>).email === "string"
  );
}

function isJwtRefreshPayload(payload: unknown): payload is JwtRefreshPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    (payload as Record<string, unknown>).type === "refresh" &&
    typeof (payload as Record<string, unknown>).sub === "string" &&
    typeof (payload as Record<string, unknown>).jti === "string"
  );
}

function signAccessToken(user: AuthenticatedUser): string {
  const payload: JwtAccessPayload = { sub: user.id, email: user.email, type: "access" };
  const options: SignOptions = {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions["expiresIn"],
    algorithm: JWT_ALGORITHM,
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
}

async function issueRefreshToken(userId: string): Promise<string> {
  const jti = crypto.randomUUID();
  const payload: JwtRefreshPayload = { sub: userId, jti, type: "refresh" };
  const options: SignOptions = {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions["expiresIn"],
    algorithm: JWT_ALGORITHM,
  };
  const token = jwt.sign(payload, env.JWT_REFRESH_SECRET, options);

  await authRepository.createRefreshToken({
    userId,
    tokenHash: hashToken(token),
    expiresAt: parseExpiryToDate(env.JWT_REFRESH_EXPIRES_IN),
  });

  return token;
}

export const authService = {
  async login(email: string, password: string): Promise<AuthTokens> {
    const user = await authRepository.findUserByEmail(email);
    if (!user) {
      throw ApiError.unauthorized("Invalid email or password");
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw ApiError.unauthorized("Invalid email or password");
    }

    const authenticatedUser: AuthenticatedUser = { id: user.id, email: user.email };
    const accessToken = signAccessToken(authenticatedUser);
    const refreshToken = await issueRefreshToken(user.id);

    return { accessToken, refreshToken };
  },

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let decoded: JwtRefreshPayload;
    try {
      const payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET, { algorithms: [JWT_ALGORITHM] });
      if (!isJwtRefreshPayload(payload)) {
        throw ApiError.unauthorized("Invalid or expired refresh token");
      }
      decoded = payload;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw ApiError.unauthorized("Invalid or expired refresh token");
    }

    const tokenHash = hashToken(refreshToken);
    const stored = await authRepository.findRefreshTokenByHash(tokenHash);

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw ApiError.unauthorized("Refresh token is no longer valid");
    }

    const user = await authRepository.findUserById(decoded.sub);
    if (!user) {
      throw ApiError.unauthorized("Invalid or expired refresh token");
    }

    // Rotate: revoke the used token and issue a new pair. This limits the
    // blast radius if a refresh token is ever stolen - it's single-use.
    await authRepository.revokeRefreshToken(stored.id);

    const authenticatedUser: AuthenticatedUser = { id: user.id, email: user.email };
    const accessToken = signAccessToken(authenticatedUser);
    const newRefreshToken = await issueRefreshToken(user.id);

    return { accessToken, refreshToken: newRefreshToken };
  },

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    const stored = await authRepository.findRefreshTokenByHash(tokenHash);
    if (stored && !stored.revokedAt) {
      await authRepository.revokeRefreshToken(stored.id);
    }
  },

  /// Verifies the caller's current password, then replaces it and revokes
  /// every outstanding refresh token for the account - a stolen or
  /// forgotten-about session shouldn't survive a password change. The
  /// caller's own access token stays cryptographically valid until its
  /// short (15m) expiry, same tradeoff logout() already accepts; the next
  /// refresh attempt (by this session or any other) is what actually
  /// forces re-login.
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await authRepository.findUserById(userId);
    if (!user) {
      throw ApiError.unauthorized("Invalid or expired access token");
    }

    const passwordMatches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!passwordMatches) {
      throw ApiError.badRequest("Current password is incorrect");
    }

    const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await authRepository.updatePasswordHash(userId, newPasswordHash);
    await authRepository.revokeAllRefreshTokensForUser(userId);
  },

  verifyAccessToken(token: string): AuthenticatedUser {
    let decoded: unknown;
    try {
      decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: [JWT_ALGORITHM] });
    } catch {
      throw ApiError.unauthorized("Invalid or expired access token");
    }

    if (!isJwtAccessPayload(decoded)) {
      throw ApiError.unauthorized("Invalid or expired access token");
    }

    return { id: decoded.sub, email: decoded.email };
  },
};
