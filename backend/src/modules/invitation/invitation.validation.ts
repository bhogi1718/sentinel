import { z } from "zod";

/// The token in an invite link: 32 random bytes, base64url-encoded.
export const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Invalid invite link");

export const createInvitationSchema = z.object({
  body: z.object({
    role: z.enum(["ADMIN", "VIEWER"]),
    note: z.string().trim().max(80).optional(),
  }),
});

export const invitationIdSchema = z.object({
  params: z.object({ invitationId: z.string().uuid() }),
});

export const inviteTokenParamsSchema = z.object({
  params: z.object({ token: inviteTokenSchema }),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>["body"];
