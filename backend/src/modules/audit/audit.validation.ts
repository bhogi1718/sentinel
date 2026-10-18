import { AuditAction } from "@prisma/client";
import { z } from "zod";

export const listAuditSchema = z.object({
  query: z
    .object({
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(100).default(25),
      action: z.nativeEnum(AuditAction).optional(),
      actorId: z.string().uuid().optional(),
      deviceId: z.string().uuid().optional(),
      /// Inclusive start and exclusive end of the time range.
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
    })
    .refine((query) => !query.from || !query.to || query.from < query.to, {
      message: "'from' must be before 'to'",
      path: ["from"],
    }),
});

export type ListAuditQuery = z.infer<typeof listAuditSchema>["query"];
