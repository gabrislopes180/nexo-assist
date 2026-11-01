import { z } from "zod";

/** Usado até a primeira resposta; depois vale o limite informado pelo backend. */
export const DEFAULT_MESSAGE_LIMIT = 30;

export const conversationSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["WITH_AGENT", "WAITING_ANALYST", "WITH_ANALYST", "CLOSED"]),
  messageCount: z.number().int().nonnegative(),
  messageLimit: z.number().int().positive(),
  remainingMessages: z.number().int().nonnegative(),
});

export type Conversation = z.infer<typeof conversationSchema>;
