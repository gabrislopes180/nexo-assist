import { z } from "zod";
import {
  TicketCategory,
  TicketPriority,
  TicketStatus,
  TicketType,
  type ConversationStatus,
} from "../generated/prisma/enums.js";
import { OPEN_STATUSES } from "../tickets/ticket-rules.js";
import { boundedText, createDraftSchema } from "./conversation-draft.js";
import type { AgentTrace } from "./transparency.js";

const userText = boundedText(2000);

/** Contrato de POST /chat. Campo extra é recusado: o dono da conversa vem só da sessão. */
export const chatRequestSchema = z.strictObject({
  message: userText,
  conversationId: z.string().min(1).max(64).optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

/**
 * Critérios de consulta de chamados. Sem campo de usuário: o dono vem da sessão.
 * Sem `transform`, para o schema servir de entrada de tool; normalize no serviço.
 */
export const ticketLookupCriteriaSchema = z.strictObject({
  code: z
    .string()
    .regex(/^(INC|REQ)-\d+$/i)
    .optional(),
  type: z.enum(TicketType).optional(),
  category: z.enum(TicketCategory).optional(),
  priority: z.enum(TicketPriority).optional(),
  status: z.enum(OPEN_STATUSES).optional(),
  keywords: z.array(z.string().min(2).max(60)).min(1).max(8).optional(),
});

export type TicketLookupCriteria = z.infer<typeof ticketLookupCriteriaSchema>;

/** Sem `description`, e com datas em ISO: o resumo vai na resposta da API. */
export const ticketSummarySchema = z.strictObject({
  code: z.string().min(1),
  type: z.enum(TicketType),
  category: z.enum(TicketCategory),
  priority: z.enum(TicketPriority),
  status: z.enum(OPEN_STATUSES),
  statusLabel: z.string().min(1),
  title: z.string().min(1),
  createdAt: z.iso.datetime(),
  dueAt: z.iso.datetime().nullable(),
  overdue: z.boolean(),
});

export type TicketSummary = z.infer<typeof ticketSummarySchema>;

/** Possível duplicado: inclui resolvido que ainda pode ser reaberto. */
export const similarTicketSchema = z.strictObject({
  ...ticketSummarySchema.shape,
  status: z.enum(TicketStatus),
  canReopen: z.boolean(),
});

export type SimilarTicket = z.infer<typeof similarTicketSchema>;

const openTicketCount = z.number().int().nonnegative();

export const ticketLookupResultSchema = z.discriminatedUnion("outcome", [
  z.strictObject({ outcome: z.literal("NO_OPEN_TICKETS"), openTicketCount: z.literal(0), totalMatches: z.literal(0), tickets: z.tuple([]) }),
  z.strictObject({ outcome: z.literal("NO_MATCH"), openTicketCount, totalMatches: z.literal(0), tickets: z.tuple([]) }),
  z.strictObject({ outcome: z.literal("SINGLE_MATCH"), openTicketCount, totalMatches: z.literal(1), tickets: z.tuple([ticketSummarySchema]) }),
  z.strictObject({
    outcome: z.literal("MULTIPLE_MATCHES"),
    openTicketCount,
    totalMatches: z.number().int().nonnegative(),
    tickets: z.array(ticketSummarySchema),
  }),
  z.strictObject({ outcome: z.literal("UNAVAILABLE"), openTicketCount: z.null(), totalMatches: z.null(), tickets: z.tuple([]) }),
]);

export type TicketLookupResult = z.infer<typeof ticketLookupResultSchema>;

export const proposedComplementDraftSchema = z.strictObject({
  kind: z.literal("COMPLEMENT"),
  ticket: ticketSummarySchema,
  content: userText,
});

export const proposedCreateDraftSchema = createDraftSchema.omit({ draftId: true, createdAt: true });

/** O que o agent propõe; o id é gerado no backend, ao salvar o rascunho na conversa. */
export const proposedAnyDraftSchema = z.discriminatedUnion("kind", [proposedComplementDraftSchema, proposedCreateDraftSchema]);

export type ProposedTicketDraft = z.infer<typeof proposedAnyDraftSchema>;

/** `dueAtPreview` é o prazo se a confirmação fosse agora; o real sai da hora da confirmação. */
export const ticketDraftSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...proposedComplementDraftSchema.shape, id: z.string().min(1) }),
  z.strictObject({
    ...proposedCreateDraftSchema.omit({ priorityReason: true }).shape,
    id: z.string().min(1),
    dueAtPreview: z.iso.datetime(),
  }),
]);

export type TicketDraft = z.infer<typeof ticketDraftSchema>;

/** Inválidas ficam de fora da resposta: são só um atalho de digitação. */
export const quickRepliesSchema = z.array(z.string().trim().min(1).max(60)).min(1).max(5);

/**
 * O texto confirmado é o que vale: a pessoa pode ajustar a proposta antes de confirmar.
 * Na criação, tipo, categoria e prioridade ficam travados no rascunho.
 */
export const confirmDraftRequestSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("COMPLEMENT"), content: userText }),
  z.strictObject({
    kind: z.literal("CREATE"),
    title: createDraftSchema.shape.title,
    description: createDraftSchema.shape.description,
    affectedScope: createDraftSchema.shape.affectedScope,
    affectedDescription: createDraftSchema.shape.affectedDescription,
  }),
]);

export type ConfirmDraftRequest = z.infer<typeof confirmDraftRequestSchema>;

export const cancelDraftRequestSchema = z.strictObject({}).optional();

export type ChatConversationView = {
  id: string;
  status: ConversationStatus;
  messageCount: number;
  messageLimit: number;
  remainingMessages: number;
};

export type ChatMessageView = {
  id: string;
  authorType: "AGENT";
  content: string;
  trace: AgentTrace;
  createdAt: string;
};

export type ChatResponse = {
  conversation: ChatConversationView;
  message: ChatMessageView;
  /** Vem do serviço de chamados, nunca do texto da LLM. Null quando nenhuma tool rodou. */
  ticketLookup: TicketLookupResult | null;
  /** Null quando o turno não propôs rascunho; um rascunho anterior continua valendo. */
  ticketDraft: TicketDraft | null;
  quickReplies: string[] | null;
};

export type ConfirmDraftResponse = { message: ChatMessageView; ticket: TicketSummary };

export type CancelDraftResponse = { message: ChatMessageView };
