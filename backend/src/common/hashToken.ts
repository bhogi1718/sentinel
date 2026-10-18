import crypto from "crypto";

/// How every bearer secret (refresh tokens, device tokens, invite links) is
/// stored: a SHA-256 hex digest, so a database leak doesn't reveal working
/// tokens. A plain hash suffices because the tokens are long and random.
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
