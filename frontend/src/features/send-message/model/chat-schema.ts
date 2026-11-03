import { z } from "zod";
import { conversationSchema } from "@/entities/conversation";
import { agentMessageSchema, timelineMessageSchema } from "@/entities/message";
import {
  ticketDraftSchema,
  ticketLookupSchema,
  ticketSummarySchema,
} from "@/entities/ticket";
import {
  MESSAGE_TEXT_MAX_LENGTH,
  messageTextSchema,
  parseMessageText,
  type ParsedMessageText,
} from "@/shared/lib/message-text";

export const CHAT_MESSAGE_MAX_LENGTH = MESSAGE_TEXT_MAX_LENGTH;
export const chatMessageSchema = messageTextSchema;
export type ParsedChatMessage = ParsedMessageText;
export const parseChatMessage = parseMessageText;

// Ausente vale como null: os campos chegaram depois e são opcionais na UI.
const nullable = <T extends z.ZodType>(schema: T) =>
  schema.nullish().transform((value) => value ?? null);

export const chatResponseSchema = z.object({
  conversation: conversationSchema,
  /** O id real troca o do item otimista e deduplica com o SSE. */
  employeeMessage: z.object({
    id: z.string().min(1),
    authorType: z.literal("EMPLOYEE"),
    content: z.string(),
    createdAt: z.iso.datetime(),
  }),
  /** Null com analista: a mensagem só foi gravada, sem resposta do agent. */
  message: agentMessageSchema.nullable(),
  ticketLookup: ticketLookupSchema.nullable(),
  ticketDraft: nullable(ticketDraftSchema),
  // Só um atalho de digitação: fora do formato, some sem derrubar o turno.
  quickReplies: z
    .array(z.string().trim().min(1))
    .min(1)
    .transform((options) => [...new Set(options)])
    .nullish()
    .catch(null)
    .transform((value) => value ?? null),
});

export const confirmDraftResponseSchema = z.object({
  message: agentMessageSchema,
  ticket: ticketSummarySchema,
  // Confirmar chamado crítico transfere a conversa: o status vem depois da ação.
  conversation: conversationSchema.pick({ id: true, status: true }).optional(),
});

export const cancelDraftResponseSchema = z.object({
  message: agentMessageSchema,
});

/** `GET /chat/conversations/:id`: ressincronização do funcionário. */
export const chatConversationDetailSchema = z.object({
  conversation: conversationSchema,
  messages: z.array(timelineMessageSchema),
});

export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type ConfirmDraftResponse = z.infer<typeof confirmDraftResponseSchema>;
export type CancelDraftResponse = z.infer<typeof cancelDraftResponseSchema>;
export type ChatConversationDetail = z.infer<
  typeof chatConversationDetailSchema
>;
