import { Prisma } from "@prisma/client";
import { hashToken } from "../../common/hashToken";
import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../../config/env";
import { isDemoUser } from "../../demo/demoSetup";
import { ApiError } from "../../common/ApiError";
import { invitationService } from "../invitation/invitation.service";
import { organizationSlug } from "../organization/organization.slug";
import { authRepository } from "./auth.repository";
import { AuthenticatedUser, AuthTokens, JwtAccessPayload, JwtRefreshPayload } from "./auth.types";
import { SignupInput } from "./auth.validation";

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
  /// Creates an account and signs them in. The account gets its own first
  /// organization, as its Owner - or, signing up from an invite link, joins
  /// that organization instead. The email isn't verified (there's no
  /// outbound email), so it serves only as the login name.
  async signup(input: SignupInput): Promise<AuthTokens> {
    if (isDemoUser(input.email)) {
      throw ApiError.conflict("An account with this email already exists");
    }
    if (await authRepository.findUserByEmail(input.email)) {
      throw ApiError.conflict("An account with this email already exists");
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    const organizationName = input.organizationName ?? `${input.name}'s organization`;

    let user: AuthenticatedUser;
    try {
      user = input.inviteToken
        ? await invitationService.acceptWithNewAccount(input.inviteToken, { email: input.email, name: input.name, passwordHash })
        : await authRepository.createUserWithOrganization({
            email: input.email,
            name: input.name,
            passwordHash,
            organization: { name: organizationName, slug: organizationSlug(organizationName) },
          });
    } catch (err) {
      // Two sign-ups with the same email at once: the second loses on the
      // unique constraint.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw ApiError.conflict("An account with this email already exists");
      }
      throw err;
    }

    return authService.issueSession(user);
  },

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

  /// Signs in a user the caller has already authenticated by other means
  /// (the public demo session). Issues exactly what login does, so the
  /// session refreshes, revokes and expires the same way.
  async issueSession(user: AuthenticatedUser): Promise<AuthTokens> {
    const accessToken = signAccessToken(user);
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
    // Every demo visitor shares this account; a password change would lock
    // the next visitor out.
    if (isDemoUser(user.email)) {
      throw ApiError.forbidden("The demo account's password can't be changed");
    }

    const passwordMatches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!passwordMatches) {
      throw ApiError.badRequest("Current password is incorrect");
    }

    const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await authRepository.updatePasswordHash(userId, newPasswordHash);
    await authRepository.revokeAllRefreshTokensForUser(userId);
  },

  /// When an access token (already checked by verifyAccessToken) stops being
  /// valid - so long-lived connections authenticated by it can be closed at
  /// that moment instead of outliving it.
  accessTokenExpiresAt(token: string): Date | null {
    const decoded = jwt.decode(token);
    if (decoded && typeof decoded === "object" && typeof decoded.exp === "number") {
      return new Date(decoded.exp * 1000);
    }
    return null;
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
