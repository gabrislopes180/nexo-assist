import { z } from "zod";

// Gêmeo do autor de `lastMessage` em entities/conversation, mais SYSTEM.
const consoleAuthorTypeSchema = z.enum([
  "EMPLOYEE",
  "AGENT",
  "ANALYST",
  "SYSTEM",
]);

export const consoleMessageSchema = z.object({
  id: z.string().min(1),
  authorType: consoleAuthorTypeSchema,
  /** Nulo para AGENT e SYSTEM. */
  author: z
    .object({ id: z.string().min(1), name: z.string().min(1) })
    .nullable(),
  content: z.string(),
  createdAt: z.iso.datetime(),
});

export const consoleMessagesResponseSchema = z.object({
  messages: z.array(consoleMessageSchema),
});

export type ConsoleMessageData = z.infer<typeof consoleMessageSchema>;
