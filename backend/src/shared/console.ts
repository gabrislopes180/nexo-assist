import { z } from "zod";
import type { ConversationStatus, HandoffReason, TicketCategory, TicketPriority, TicketStatus, TicketType } from "../generated/prisma/enums.js";
import type { Person } from "./chat.js";
import { boundedText } from "./conversation-draft.js";
import type { AgentTrace } from "./transparency.js";

export type { Person };

/** Mensagem da linha do tempo, igual para o console, o chat do funcionário e o SSE. */
export type TimelineMessageView = {
  id: string;
  authorType: "EMPLOYEE" | "AGENT" | "ANALYST" | "SYSTEM";
  /** EMPLOYEE = dono, ANALYST = analista; AGENT e SYSTEM = null. */
  author: Person | null;
  content: string;
  createdAt: string;
  /** Só em mensagens do AGENT. */
  trace: AgentTrace | null;
};

export type ConsoleConversation = {
  id: string;
  status: ConversationStatus;
  owner: Person & { department: string | null };
  analyst: Person | null;
  /** Calculado para o analista da sessão. */
  assignedToMe: boolean;
  assignedAt: string | null;
  handoffReason: HandoffReason | null;
  handoffSummary: string | null;
  handoffAt: string | null;
  lastMessageAt: string;
  closedAt: string | null;
  messageCount: number;
  messageLimit: number;
  /** Última mensagem que não é SYSTEM. */
  lastMessage: { authorType: "EMPLOYEE" | "AGENT" | "ANALYST"; content: string; createdAt: string } | null;
  /** Da última mensagem do AGENT; trace inválido = null. */
  lastAgentConfidence: AgentTrace["confidence"] | null;
  ticketCode: string | null;
};

export type ConsoleTicket = {
  code: string;
  type: TicketType;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  statusLabel: string;
  title: string;
  createdAt: string;
  resolvedAt: string | null;
};

export type ConsoleTickets = { conversationTicket: ConsoleTicket | null; otherTickets: ConsoleTicket[] };

export const consoleListQuerySchema = z.strictObject({
  filter: z.enum(["all", "waiting", "with-agent", "mine"]).default("all"),
  q: z.string().trim().max(100).optional(),
});

export type ConsoleListQuery = z.infer<typeof consoleListQuerySchema>;

export const analystReplySchema = z.strictObject({ content: boundedText(2000) });

/** Corpo ausente ou `{}`: as ações do console não recebem campos. */
export const emptyBodySchema = z.strictObject({}).optional();
