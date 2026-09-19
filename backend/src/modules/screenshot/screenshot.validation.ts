import { z } from "zod";

export const screenshotErrorSchema = z.object({
  requestId: z.string().uuid(),
  error: z.string(),
});
