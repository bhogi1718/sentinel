import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";

vi.mock("./auth.repository", () => ({
  authRepository: {
    findUserByEmail: vi.fn(),
    findUserById: vi.fn(),
    createRefreshToken: vi.fn(),
    findRefreshTokenByHash: vi.fn(),
    revokeRefreshToken: vi.fn(),
    revokeAllRefreshTokensForUser: vi.fn(),
  },
}));

vi.mock("bcrypt", () => ({
  default: {
    compare: vi.fn(),
  },
}));

import { authRepository } from "./auth.repository";
import bcrypt from "bcrypt";
import { authService } from "./auth.service";
import { env } from "../../config/env";
import { ApiError } from "../../common/ApiError";

const mockedRepo = vi.mocked(authRepository, true);
const mockedBcrypt = vi.mocked(bcrypt, true);

describe("authService.verifyAccessToken", () => {
  it("accepts a validly signed access token", () => {
    const token = jwt.sign({ sub: "user-1", email: "a@b.com", type: "access" }, env.JWT_ACCESS_SECRET, {
      algorithm: "HS256",
      expiresIn: "15m",
    });

    const user = authService.verifyAccessToken(token);
    expect(user).toEqual({ id: "user-1", email: "a@b.com" });
  });

  it("rejects a token signed with the wrong secret", () => {
    const token = jwt.sign({ sub: "user-1", email: "a@b.com", type: "access" }, "totally-different-secret", {
      algorithm: "HS256",
      expiresIn: "15m",
    });

    expect(() => authService.verifyAccessToken(token)).toThrow(ApiError);
  });

  it("rejects a refresh token presented as an access token", () => {
    // Same secret family confusion is impossible since access/refresh use
    // different secrets in production, but the payload `type` discriminator
    // must still be checked - this uses the *access* secret with a
    // *refresh*-shaped payload to isolate that check specifically.
    const token = jwt.sign({ sub: "user-1", jti: "abc", type: "refresh" }, env.JWT_ACCESS_SECRET, {
      algorithm: "HS256",
      expiresIn: "15m",
    });

    expect(() => authService.verifyAccessToken(token)).toThrow(ApiError);
  });

  it("rejects an expired token", () => {
    const token = jwt.sign({ sub: "user-1", email: "a@b.com", type: "access" }, env.JWT_ACCESS_SECRET, {
      algorithm: "HS256",
      expiresIn: -10,
    });

    expect(() => authService.verifyAccessToken(token)).toThrow(ApiError);
  });

  it("rejects a token signed with an unexpected algorithm", () => {
    // jsonwebtoken refuses to *sign* with "none", so the attack this guards
    // against is forged manually: header+payload base64url, no signature.
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ sub: "user-1", email: "a@b.com", type: "access" })).toString(
      "base64url",
    );
    const forgedToken = `${header}.${payload}.`;

    expect(() => authService.verifyAccessToken(forgedToken)).toThrow(ApiError);
  });
});

describe("authService.login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws unauthorized when the user does not exist", async () => {
    mockedRepo.findUserByEmail.mockResolvedValue(null);

    await expect(authService.login("missing@example.com", "password")).rejects.toThrow(ApiError);
  });

  it("throws unauthorized when the password does not match", async () => {
    mockedRepo.findUserByEmail.mockResolvedValue({
      id: "user-1",
      email: "a@b.com",
      passwordHash: "hashed",
    } as never);
    mockedBcrypt.compare.mockResolvedValue(false as never);

    await expect(authService.login("a@b.com", "wrong-password")).rejects.toThrow(ApiError);
  });

  it("issues a token pair on valid credentials", async () => {
    mockedRepo.findUserByEmail.mockResolvedValue({
      id: "user-1",
      email: "a@b.com",
      passwordHash: "hashed",
    } as never);
    mockedBcrypt.compare.mockResolvedValue(true as never);
    mockedRepo.createRefreshToken.mockResolvedValue({} as never);

    const tokens = await authService.login("a@b.com", "correct-password");

    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
    expect(mockedRepo.createRefreshToken).toHaveBeenCalledOnce();

    const decoded = authService.verifyAccessToken(tokens.accessToken);
    expect(decoded).toEqual({ id: "user-1", email: "a@b.com" });
  });
});
