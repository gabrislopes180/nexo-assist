import { Prisma } from "../generated/prisma/client.js";
import { complementDraftSchema, type ComplementDraft } from "../shared/conversation-draft.js";
import type { TicketSummary } from "../shared/chat.js";
import type { AgentTrace } from "../shared/transparency.js";
import { toTicketSummary } from "../tickets/ticket-matching.js";
import { applyTicketEvent, OPEN_STATUSES } from "../tickets/ticket-rules.js";
import { isOpenTicket, matchableTicketSelect } from "../tickets/ticket-service.js";
import { ConversationNotWithAgentError } from "./conversation-rules.js";

/** Inexistente, já usado ou de outro dono: a mesma resposta, para não revelar qual dos casos é. */
export class DraftNotFoundError extends Error {
  constructor() {
    super("Rascunho não encontrado");
    this.name = "DraftNotFoundError";
  }
}

export class TicketNotOpenError extends Error {
  constructor() {
    super("Chamado não está aberto");
    this.name = "TicketNotOpenError";
  }
}

export type StoredAgentMessage = { id: string; content: string; trace: AgentTrace; createdAt: Date };

type DraftTransaction = Prisma.TransactionClient;

const pendingDraftSelect = { id: true, status: true, pendingDraft: true } as const;

type LocatedDraft = { conversationId: string; draft: ComplementDraft };

/** Rascunho que não é um complemento válido não existe para o cliente. */
async function locateDraft(client: Pick<DraftTransaction, "conversation">, ownerId: string, draftId: string): Promise<LocatedDraft> {
  const conversation = await client.conversation.findFirst({ where: { ownerId, pendingDraftId: draftId }, select: pendingDraftSelect });
  const draft = complementDraftSchema.safeParse(conversation?.pendingDraft);
  if (!conversation || !draft.success) throw new DraftNotFoundError();
  if (conversation.status !== "WITH_AGENT") throw new ConversationNotWithAgentError();
  return { conversationId: conversation.id, draft: draft.data };
}

export async function readComplementDraft(client: Pick<DraftTransaction, "conversation">, ownerId: string, draftId: string): Promise<ComplementDraft> {
  return (await locateDraft(client, ownerId, draftId)).draft;
}

/** Limpa o rascunho de forma condicional: é o que impede o duplo clique de gravar duas vezes. */
async function claimDraft(tx: DraftTransaction, ownerId: string, draftId: string, now: Date): Promise<LocatedDraft> {
  const located = await locateDraft(tx, ownerId, draftId);

  const { count } = await tx.conversation.updateMany({
    where: { id: located.conversationId, ownerId, status: "WITH_AGENT", pendingDraftId: draftId },
    data: { pendingDraft: Prisma.DbNull, pendingDraftId: null, lastMessageAt: now },
  });
  if (count === 0) throw new DraftNotFoundError();
  return located;
}

async function writeAgentMessage(tx: DraftTransaction, conversationId: string, content: string, trace: AgentTrace, now: Date): Promise<StoredAgentMessage> {
  const message = await tx.message.create({
    data: { conversationId, authorType: "AGENT", authorId: null, content, trace, createdAt: now },
    select: { id: true, createdAt: true },
  });
  return { id: message.id, content, trace, createdAt: message.createdAt };
}

/** O prazo e o status seguem `applyTicketEvent`: comentário do funcionário só muda `updatedAt`. */
async function addComplement(
  tx: DraftTransaction,
  { ownerId, conversationId, code, content, now }: { ownerId: string; conversationId: string; code: string; content: string; now: Date },
): Promise<TicketSummary> {
  const ticket = await tx.ticket.findFirst({
    where: { code, ownerId, status: { in: [...OPEN_STATUSES] } },
    select: { ...matchableTicketSelect, id: true, slaStartedAt: true, resolvedAt: true, updatedAt: true },
  });
  if (!ticket || !isOpenTicket(ticket)) throw new TicketNotOpenError();

  const { next, eventDueAt } = applyTicketEvent(ticket, { type: "COMMENT", actorType: "EMPLOYEE", at: now }, now);
  await tx.ticketEvent.create({
    data: {
      ticketId: ticket.id,
      type: "COMMENT",
      actorType: "EMPLOYEE",
      actorId: ownerId,
      content,
      dueAt: eventDueAt,
      conversationId,
      createdAt: now,
    },
  });
  await tx.ticket.update({ where: { id: ticket.id }, data: { updatedAt: next.updatedAt } });
  return toTicketSummary(ticket, now);
}

export async function confirmComplement(
  tx: DraftTransaction,
  { ownerId, draftId, content, now }: { ownerId: string; draftId: string; content: string; now: Date },
): Promise<{ message: StoredAgentMessage; ticket: TicketSummary }> {
  const { conversationId, draft } = await claimDraft(tx, ownerId, draftId, now);
  const code = draft.ticketCode;
  const ticket = await addComplement(tx, { ownerId, conversationId, code, content, now });
  const message = await writeAgentMessage(
    tx,
    conversationId,
    `Pronto, adicionei o complemento ao chamado ${code}.`,
    {
      understood: `Confirmação do complemento do chamado ${code}.`,
      intent: "COMPLEMENT",
      actions: [{ tool: "addTicketComplement", summary: `Registrou o complemento no chamado ${code}.`, status: "SUCCESS" }],
      confidence: "HIGH",
      reason: "Confirmação explícita do rascunho pendente.",
    },
    now,
  );
  return { message, ticket };
}

export async function cancelComplement(
  tx: DraftTransaction,
  { ownerId, draftId, now }: { ownerId: string; draftId: string; now: Date },
): Promise<{ message: StoredAgentMessage }> {
  const { conversationId, draft } = await claimDraft(tx, ownerId, draftId, now);
  const code = draft.ticketCode;
  const message = await writeAgentMessage(
    tx,
    conversationId,
    `Tudo bem, cancelei o complemento. O chamado ${code} não foi alterado.`,
    {
      understood: `Cancelamento do complemento do chamado ${code}.`,
      intent: "COMPLEMENT",
      actions: [{ tool: "addTicketComplement", summary: `Rascunho descartado; nada foi gravado no chamado ${code}.`, status: "SKIPPED" }],
      confidence: "HIGH",
      reason: "Cancelamento explícito do rascunho pendente.",
    },
    now,
  );
  return { message };
}
