import { z } from "zod";

/// What a code looks like once normalized: 8 characters from the pairing
/// alphabet (see pairing.service.ts).
const CODE_PATTERN = /^[A-HJKMNP-Z2-9]{8}$/;

/// Codes are shown as "K7QM-3XRP" but typed however people type them:
/// lowercase, without the dash, with spaces.
export function normalizePairingCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, "");
}

export const createPairingCodeSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1, "Device name is required").max(100),
  }),
});

export const pairingCodeIdSchema = z.object({
  params: z.object({ pairingCodeId: z.string().uuid() }),
});

export const claimPairingCodeSchema = z.object({
  body: z.object({
    code: z
      .string()
      .max(32)
      .transform(normalizePairingCode)
      .refine((code) => CODE_PATTERN.test(code), "That isn't a valid pairing code"),
  }),
});

export type CreatePairingCodeInput = z.infer<typeof createPairingCodeSchema>["body"];
export type ClaimPairingCodeInput = z.infer<typeof claimPairingCodeSchema>["body"];
