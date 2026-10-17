import { z } from "zod";

export const createDeviceSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1, "Device name is required").max(100),
  }),
});

export type CreateDeviceInput = z.infer<typeof createDeviceSchema>["body"];
