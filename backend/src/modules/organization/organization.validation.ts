import { z } from "zod";
import { organizationNameSchema } from "../auth/auth.validation";

export const createOrganizationSchema = z.object({
  body: z.object({ name: organizationNameSchema }),
});

export const memberParamsSchema = z.object({
  params: z.object({ userId: z.string().uuid() }),
});

export const changeRoleSchema = memberParamsSchema.extend({
  body: z.object({ role: z.enum(["OWNER", "ADMIN", "VIEWER"]) }),
});

export type ChangeRoleInput = z.infer<typeof changeRoleSchema>["body"];
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>["body"];
