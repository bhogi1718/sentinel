import { z } from "zod";

export const connectTelegramSchema = z.object({
  body: z.object({
    botToken: z.string().min(1, "Bot token is required"),
    chatId: z.string().min(1, "Chat ID is required"),
  }),
});

export type ConnectTelegramInput = z.infer<typeof connectTelegramSchema>["body"];
