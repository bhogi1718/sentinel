import crypto from "crypto";

const SUFFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/// A URL-safe, unique-enough slug for a new organization: the name in
/// lowercase ASCII plus a random 6-character suffix. The suffix means two
/// organizations can share a name, and no one can claim a reserved slug
/// such as the demo's "demo".
export function organizationSlug(name: string): string {
  const base =
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") || "org";
  const suffix = Array.from(crypto.randomBytes(6), (byte) => SUFFIX_ALPHABET[byte % SUFFIX_ALPHABET.length]).join("");
  return `${base}-${suffix}`;
}
