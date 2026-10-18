import { z } from "zod";
import { NEW_PASSWORD_MIN_LENGTH } from "@/lib/passwordRules";

export const signupSchema = z.object({
  name: z.string().trim().min(1, "Your name is required").max(80, "Keep it under 80 characters"),
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
  password: z
    .string()
    .min(NEW_PASSWORD_MIN_LENGTH, `Use at least ${NEW_PASSWORD_MIN_LENGTH} characters`)
    .max(200, "That password is too long"),
  organizationName: z.string().trim().max(80, "Keep it under 80 characters"),
});

export type SignupFormValues = z.infer<typeof signupSchema>;
