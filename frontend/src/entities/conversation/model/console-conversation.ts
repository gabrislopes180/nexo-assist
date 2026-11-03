import { z } from "zod";
import { conversationStatusSchema, personSchema } from "./conversation";

export const handoffReasonSchema = z.enum([
  "EMPLOYEE_REQUEST",
  "CRITICAL",
  "OVERDUE",
  "LOW_CONFIDENCE",
]);

// Gêmeo do enum de confiança do trace; entities não importam umas das outras.
export const agentConfidenceSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);

export const consoleConversationSchema = z.object({
  id: z.string().min(1),
  status: conversationStatusSchema,
  owner: personSchema.extend({ department: z.string().nullable() }),
  analyst: personSchema.nullable(),
  /** Calculado pelo servidor a partir da sessão. */
  assignedToMe: z.boolean(),
  assignedAt: z.iso.datetime().nullable(),
  handoffReason: handoffReasonSchema.nullable(),
  handoffSummary: z.string().nullable(),
  handoffAt: z.iso.datetime().nullable(),
  lastMessageAt: z.iso.datetime(),
  closedAt: z.iso.datetime().nullable(),
  messageCount: z.number().int().nonnegative(),
  messageLimit: z.number().int().positive(),
  /** A última que não é SYSTEM. */
  lastMessage: z
    .object({
      authorType: z.enum(["EMPLOYEE", "AGENT", "ANALYST"]),
      content: z.string(),
      createdAt: z.iso.datetime(),
    })
    .nullable(),
  lastAgentConfidence: agentConfidenceSchema.nullable(),
  ticketCode: z.string().nullable(),
});

export const consoleConversationListResponseSchema = z.object({
  conversations: z.array(consoleConversationSchema),
});

export const consoleConversationResponseSchema = z.object({
  conversation: consoleConversationSchema,
});

export type HandoffReason = z.infer<typeof handoffReasonSchema>;
export type AgentConfidence = z.infer<typeof agentConfidenceSchema>;
export type ConsoleConversation = z.infer<typeof consoleConversationSchema>;
