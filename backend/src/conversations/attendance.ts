import { Prisma } from "../generated/prisma/client.js";
import { ConversationNotFoundError } from "./conversation-rules.js";
import { readSnapshot, timelineMessageSelect, toTimelineMessage, type AttendanceResult, type Person, type TimelineMessage } from "./timeline.js";

/** Assumir ou devolver uma conversa que já não está esperando (ou não é do analista). */
export class ConversationNotWaitingError extends Error {
  constructor() {
    super("Conversa não está esperando atendente");
    this.name = "ConversationNotWaitingError";
  }
}

/** Responder ou encerrar uma conversa que não está sendo atendida pelo analista da sessão. */
export class ConversationNotAssignedError extends Error {
  constructor() {
    super("Conversa não está atribuída a este analista");
    this.name = "ConversationNotAssignedError";
  }
}

export const RETURN_SYSTEM_MESSAGE = "Conversa devolvida ao agent";

export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

export function takeoverSystemMessage(analystName: string): string {
  return `${firstNameOf(analystName)} assumiu a conversa`;
}

export function closeSystemMessage(analystName: string): string {
  return `${firstNameOf(analystName)} encerrou o atendimento`;
}

type Tx = Prisma.TransactionClient;
type Action = { conversationId: string; analyst: Person; now: Date };

async function writeMessage(
  tx: Tx,
  data: { conversationId: string; authorType: "SYSTEM" | "ANALYST"; authorId: string | null; content: string; createdAt: Date },
): Promise<TimelineMessage> {
  return toTimelineMessage(await tx.message.create({ data, select: timelineMessageSelect }));
}

const systemMessage = (tx: Tx, conversationId: string, content: string, createdAt: Date) =>
  writeMessage(tx, { conversationId, authorType: "SYSTEM", authorId: null, content, createdAt });

/** Com o condicional recusado, relê para escolher a resposta; inexistente vira 404. */
async function currentState(tx: Tx, conversationId: string) {
  const current = await tx.conversation.findUnique({ where: { id: conversationId }, select: { status: true, analystId: true } });
  if (!current) throw new ConversationNotFoundError();
  return current;
}

/** WAITING_ANALYST para WITH_ANALYST. O mesmo analista de novo (duplo clique) é idempotente. */
export async function takeOver(tx: Tx, { conversationId, analyst, now }: Action): Promise<AttendanceResult> {
  const { count } = await tx.conversation.updateMany({
    where: { id: conversationId, status: "WAITING_ANALYST" },
    data: {
      status: "WITH_ANALYST",
      analystId: analyst.id,
      assignedAt: now,
      lastMessageAt: now,
      pendingDraft: Prisma.DbNull,
      pendingDraftId: null,
    },
  });
  if (count === 0) {
    const current = await currentState(tx, conversationId);
    if (current.status === "WITH_ANALYST" && current.analystId === analyst.id) {
      return { snapshot: await readSnapshot(tx, conversationId), createdMessages: [] };
    }
    throw new ConversationNotWaitingError();
  }
  const message = await systemMessage(tx, conversationId, takeoverSystemMessage(analyst.name), now);
  return { snapshot: await readSnapshot(tx, conversationId), createdMessages: [message] };
}

export async function replyAsAnalyst(
  tx: Tx,
  { conversationId, analyst, now, content }: Action & { content: string },
): Promise<AttendanceResult & { message: TimelineMessage }> {
  const { count } = await tx.conversation.updateMany({
    where: { id: conversationId, status: "WITH_ANALYST", analystId: analyst.id },
    data: { lastMessageAt: now },
  });
  if (count === 0) {
    await currentState(tx, conversationId);
    throw new ConversationNotAssignedError();
  }
  const message = await writeMessage(tx, { conversationId, authorType: "ANALYST", authorId: analyst.id, content, createdAt: now });
  return { snapshot: await readSnapshot(tx, conversationId), createdMessages: [message], message };
}

/** Em espera (sem assumir) ou assumida por mim, de volta ao agent. Não é idempotente: a segunda chamada vê WITH_AGENT. */
export async function returnToAgent(tx: Tx, { conversationId, analyst, now }: Action): Promise<AttendanceResult> {
  const { count } = await tx.conversation.updateMany({
    where: { id: conversationId, OR: [{ status: "WAITING_ANALYST" }, { status: "WITH_ANALYST", analystId: analyst.id }] },
    data: {
      status: "WITH_AGENT",
      analystId: null,
      assignedAt: null,
      handoffReason: null,
      handoffSummary: null,
      handoffAt: null,
      pendingDraft: Prisma.DbNull,
      pendingDraftId: null,
      returnedToAgentAt: now,
      lastMessageAt: now,
    },
  });
  if (count === 0) {
    await currentState(tx, conversationId);
    throw new ConversationNotWaitingError();
  }
  const message = await systemMessage(tx, conversationId, RETURN_SYSTEM_MESSAGE, now);
  return { snapshot: await readSnapshot(tx, conversationId), createdMessages: [message] };
}

/** Encerra o atendimento; analista e transferência ficam como registro. Repetir pelo mesmo analista é idempotente. */
export async function closeAttendance(tx: Tx, { conversationId, analyst, now }: Action): Promise<AttendanceResult> {
  const { count } = await tx.conversation.updateMany({
    where: { id: conversationId, status: "WITH_ANALYST", analystId: analyst.id },
    data: { status: "CLOSED", closedAt: now, lastMessageAt: now, pendingDraft: Prisma.DbNull, pendingDraftId: null },
  });
  if (count === 0) {
    const current = await currentState(tx, conversationId);
    if (current.status === "CLOSED" && current.analystId === analyst.id) {
      return { snapshot: await readSnapshot(tx, conversationId), createdMessages: [] };
    }
    throw new ConversationNotAssignedError();
  }
  const message = await systemMessage(tx, conversationId, closeSystemMessage(analyst.name), now);
  return { snapshot: await readSnapshot(tx, conversationId), createdMessages: [message] };
}
