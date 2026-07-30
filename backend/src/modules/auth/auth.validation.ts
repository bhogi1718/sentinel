import { z } from "zod";

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

export type LoginInput = z.infer<typeof loginSchema>["body"];
export type RefreshInput = z.infer<typeof refreshSchema>["body"];
