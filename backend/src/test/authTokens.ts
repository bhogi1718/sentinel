import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { JwtAccessPayload } from "../modules/auth/auth.types";

/// A valid access token for the given user, signed the same way login
/// signs them - for exercising authenticated routes in tests.
export function accessTokenFor(user: { id: string; email: string }, expiresInSeconds = 300): string {
  const payload: JwtAccessPayload = { sub: user.id, email: user.email, type: "access" };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { algorithm: "HS256", expiresIn: expiresInSeconds });
}
