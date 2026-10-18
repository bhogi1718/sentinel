import { z } from "zod";
import { inviteTokenSchema } from "../invitation/invitation.validation";

/// Every new password: at sign-up and when changing it.
export const NEW_PASSWORD_MIN_LENGTH = 10;
const newPassword = z
  .string()
  .min(NEW_PASSWORD_MIN_LENGTH, `Password must be at least ${NEW_PASSWORD_MIN_LENGTH} characters`)
  .max(200, "Password is too long");

export const organizationNameSchema = z.string().trim().min(1, "Organization name is required").max(80);

export const signupSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1, "Your name is required").max(80),
    email: z.string().trim().toLowerCase().email("A valid email is required").max(254),
    password: newPassword,
    organizationName: organizationNameSchema.optional(),
    /// Signing up from an invite link: the account joins that
    /// organization instead of getting one of its own.
    inviteToken: inviteTokenSchema.optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email("A valid email is required"),
    password: z.string().min(1, "Password is required"),
  }),
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, "Refresh token is required"),
  }),
});

export const changePasswordSchema = z.object({
  body: z
    .object({
      currentPassword: z.string().min(1, "Current password is required"),
      newPassword,
    })
    .refine((data) => data.newPassword !== data.currentPassword, {
      message: "New password must be different from the current password",
      path: ["newPassword"],
    }),
});

export type SignupInput = z.infer<typeof signupSchema>["body"];
export type LoginInput = z.infer<typeof loginSchema>["body"];
export type RefreshInput = z.infer<typeof refreshSchema>["body"];
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>["body"];
