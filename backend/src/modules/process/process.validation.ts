import { z } from "zod";

export const processListResponseSchema = z.object({
  requestId: z.string().uuid(),
  processes: z.array(
    z.object({
      pid: z.number().int().nonnegative(),
      name: z.string(),
      cpuPercent: z.number().nonnegative(),
      memoryBytes: z.number().nonnegative(),
      isApp: z.boolean(),
    }),
  ),
});

export type ProcessListResponseInput = z.infer<typeof processListResponseSchema>;
