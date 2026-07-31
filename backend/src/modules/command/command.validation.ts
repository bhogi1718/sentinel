import { CommandType } from "@prisma/client";
import { z } from "zod";

export const createCommandSchema = z.object({
  body: z.object({
    type: z.nativeEnum(CommandType),
  }),
});

export const commandAckSchema = z.object({
  commandId: z.string().uuid(),
  success: z.boolean(),
  error: z.string().optional(),
});

export type CreateCommandInput = z.infer<typeof createCommandSchema>["body"];
export type CommandAckInput = z.infer<typeof commandAckSchema>;
