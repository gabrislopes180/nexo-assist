import { z } from "zod";

/** Usado até a primeira resposta; depois vale o limite informado pelo backend. */
export const DEFAULT_MESSAGE_LIMIT = 30;

export const conversationStatusSchema = z.enum([
  "WITH_AGENT",
  "WAITING_ANALYST",
  "WITH_ANALYST",
  "CLOSED",
]);

export const personSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

export const conversationSchema = z.object({
  id: z.string().min(1),
  status: conversationStatusSchema,
  messageCount: z.number().int().nonnegative(),
  messageLimit: z.number().int().positive(),
  /** Cota com o agent; com analista a mensagem é aceita mesmo em 0. */
  remainingMessages: z.number().int().nonnegative(),
  /** Quem atende, quando um analista assumiu. */
  analyst: personSchema.nullable(),
});

export type Conversation = z.infer<typeof conversationSchema>;
export type Person = z.infer<typeof personSchema>;
export type ConversationStatus = z.infer<typeof conversationStatusSchema>;
