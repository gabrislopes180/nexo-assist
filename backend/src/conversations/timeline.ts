import type { Prisma } from "../generated/prisma/client.js";
import type { ConversationStatus, HandoffReason, MessageAuthorType } from "../generated/prisma/enums.js";
import type { TimelineMessageView } from "../shared/console.js";
import { agentTraceSchema, type AgentTrace } from "../shared/transparency.js";
import { ConversationNotFoundError } from "./conversation-rules.js";

export type Person = { id: string; name: string };

/** Mensagem com datas `Date`; a view ISO sai nos serviços de chat e de console. */
export type TimelineMessage = {
  id: string;
  conversationId: string;
  authorType: MessageAuthorType;
  /** EMPLOYEE = dono, ANALYST = analista; AGENT e SYSTEM = null. */
  author: Person | null;
  content: string;
  createdAt: Date;
  /** Só em mensagens do AGENT; trace gravado inválido vira null. */
  trace: AgentTrace | null;
};

/** Linha de Conversation relida no fim da transação. */
export type ConversationSnapshot = {
  id: string;
  status: ConversationStatus;
  owner: Person & { department: string | null };
  analyst: Person | null;
  messageCount: number;
  handoffReason: HandoffReason | null;
  handoffSummary: string | null;
  handoffAt: Date | null;
  assignedAt: Date | null;
  returnedToAgentAt: Date | null;
  lastMessageAt: Date;
  closedAt: Date | null;
};

export type AttendanceResult = { snapshot: ConversationSnapshot; createdMessages: TimelineMessage[] };

type Reader = Pick<Prisma.TransactionClient, "conversation">;

const personSelect = { id: true, name: true } as const;

export const timelineMessageSelect = {
  id: true,
  conversationId: true,
  authorType: true,
  content: true,
  createdAt: true,
  trace: true,
  author: { select: personSelect },
} as const;

export type TimelineMessageRow = Prisma.MessageGetPayload<{ select: typeof timelineMessageSelect }>;

export function toTimelineMessage(row: TimelineMessageRow): TimelineMessage {
  const trace = row.authorType === "AGENT" ? agentTraceSchema.safeParse(row.trace) : null;
  return {
    id: row.id,
    conversationId: row.conversationId,
    authorType: row.authorType,
    author: row.authorType === "EMPLOYEE" || row.authorType === "ANALYST" ? row.author : null,
    content: row.content,
    createdAt: row.createdAt,
    trace: trace?.success ? trace.data : null,
  };
}

export const snapshotSelect = {
  id: true,
  status: true,
  messageCount: true,
  handoffReason: true,
  handoffSummary: true,
  handoffAt: true,
  assignedAt: true,
  returnedToAgentAt: true,
  lastMessageAt: true,
  closedAt: true,
  owner: { select: { ...personSelect, department: true } },
  analyst: { select: personSelect },
} as const;

export async function readSnapshot(client: Reader, conversationId: string): Promise<ConversationSnapshot> {
  const snapshot = await client.conversation.findUnique({ where: { id: conversationId }, select: snapshotSelect });
  if (!snapshot) throw new ConversationNotFoundError();
  return snapshot;
}

export function toTimelineMessageView(message: TimelineMessage): TimelineMessageView {
  return {
    id: message.id,
    authorType: message.authorType,
    author: message.author,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    trace: message.trace,
  };
}
