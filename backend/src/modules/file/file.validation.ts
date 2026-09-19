import { z } from "zod";

// Defense-in-depth only - the agent is the actual enforcement point for
// containing paths within the user's profile root, since it must not trust
// the backend any more than the backend trusts the dashboard. This just
// rejects obviously malformed input before a request ever reaches the
// agent, and rejects ".." segments outright since there's never a
// legitimate reason for the dashboard to send one.
const relativePathSchema = z
  .string()
  .max(4096)
  .refine((value) => !value.split(/[\\/]/).includes(".."), "Path must not contain '..' segments");

export const listFilesQuerySchema = z.object({
  query: z.object({
    path: relativePathSchema.default(""),
  }),
});

export const downloadFileQuerySchema = z.object({
  query: z.object({
    path: relativePathSchema,
    token: z.string().min(1),
  }),
});

export const fileListResponseSchema = z.object({
  requestId: z.string().uuid(),
  entries: z.array(
    z.object({
      name: z.string(),
      isDirectory: z.boolean(),
      sizeBytes: z.number().nonnegative(),
      modifiedAt: z.string(),
    }),
  ),
});

export const fileListErrorSchema = z.object({
  requestId: z.string().uuid(),
  error: z.string(),
});

export type ListFilesQuery = z.infer<typeof listFilesQuerySchema>["query"];
export type DownloadFileQuery = z.infer<typeof downloadFileQuerySchema>["query"];
