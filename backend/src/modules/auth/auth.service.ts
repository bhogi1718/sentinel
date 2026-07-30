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

function signAccessToken(user: AuthenticatedUser): string {
  const payload: JwtAccessPayload = { sub: user.id, email: user.email, type: "access" };
  const options: SignOptions = { expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions["expiresIn"] };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
}

async function issueRefreshToken(userId: string): Promise<string> {
  const jti = crypto.randomUUID();
  const payload: JwtRefreshPayload = { sub: userId, jti, type: "refresh" };
  const options: SignOptions = { expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions["expiresIn"] };
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
    const [accessToken, refreshToken] = await Promise.all([
      signAccessToken(authenticatedUser),
      issueRefreshToken(user.id),
    ]);

    return { accessToken, refreshToken };
  },

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let decoded: JwtRefreshPayload;
    try {
      decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as JwtRefreshPayload;
    } catch {
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
    const [accessToken, newRefreshToken] = await Promise.all([
      signAccessToken(authenticatedUser),
      issueRefreshToken(user.id),
    ]);

    return { accessToken, refreshToken: newRefreshToken };
  },

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    const stored = await authRepository.findRefreshTokenByHash(tokenHash);
    if (stored && !stored.revokedAt) {
      await authRepository.revokeRefreshToken(stored.id);
    }
  },

  verifyAccessToken(token: string): AuthenticatedUser {
    try {
      const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtAccessPayload;
      return { id: decoded.sub, email: decoded.email };
    } catch {
      throw ApiError.unauthorized("Invalid or expired access token");
    }
  },
};
