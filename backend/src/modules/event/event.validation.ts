import { EventType } from "@prisma/client";
import { z } from "zod";

export const reportEventSchema = z.object({
  type: z.nativeEnum(EventType),
  metadata: z.record(z.unknown()).optional(),
  occurredAt: z.string().datetime().optional(),
});

export const listEventsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(25),
    type: z.nativeEnum(EventType).optional(),
  }),
});

export type ReportEventInput = z.infer<typeof reportEventSchema>;
export type ListEventsQuery = z.infer<typeof listEventsSchema>["query"];
