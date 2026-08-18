import { CommandType } from "@prisma/client";
import { z } from "zod";

// KILL_PROCESS is the only command type that targets something narrower
// than the whole machine, so it's the only one requiring a payload - a
// discriminated union keeps pid/name required exactly when type is
// KILL_PROCESS and absent otherwise, rather than making them optional
// fields every other command type could accidentally (or maliciously)
// smuggle a value into.
const simpleCommandTypes = [
  CommandType.LOCK,
  CommandType.RESTART,
  CommandType.SHUTDOWN,
  CommandType.SLEEP,
  CommandType.LOG_OFF,
] as const;

export const createCommandSchema = z.object({
  body: z.discriminatedUnion("type", [
    z.object({ type: z.enum(simpleCommandTypes) }),
    z.object({
      type: z.literal(CommandType.KILL_PROCESS),
      pid: z.number().int().positive(),
      name: z.string().min(1).max(260),
    }),
  ]),
});

export const commandAckSchema = z.object({
  commandId: z.string().uuid(),
  success: z.boolean(),
  error: z.string().optional(),
});

export type CreateCommandInput = z.infer<typeof createCommandSchema>["body"];
export type CommandAckInput = z.infer<typeof commandAckSchema>;
