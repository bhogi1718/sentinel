import { z } from "zod";

export const metricsResponseSchema = z.object({
  requestId: z.string().uuid(),
  metrics: z.object({
    cpuPercent: z.number().nonnegative(),
    memoryUsedBytes: z.number().nonnegative(),
    memoryTotalBytes: z.number().nonnegative(),
    diskUsedBytes: z.number().nonnegative(),
    diskTotalBytes: z.number().nonnegative(),
    batteryPercent: z.number().nonnegative().nullable(),
    networkDownloadBytesPerSec: z.number().nonnegative(),
    networkUploadBytesPerSec: z.number().nonnegative(),
    networkTotalReceivedBytes: z.number().nonnegative(),
    networkTotalTransmittedBytes: z.number().nonnegative(),
    pingMs: z.number().nonnegative().nullable(),
  }),
});

export type MetricsResponseInput = z.infer<typeof metricsResponseSchema>;
