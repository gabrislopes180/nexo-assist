import { Prisma } from "../generated/prisma/client.js";
import type { ConfirmDraftRequest, TicketSummary } from "../shared/chat.js";
import { confirmableDraftSchema, type ComplementDraft, type ConfirmableDraft, type CreateDraft } from "../shared/conversation-draft.js";
import type { AgentTrace } from "../shared/transparency.js";
import { formatLocalDateTime } from "../tickets/sla.js";
import { toTicketSummary } from "../tickets/ticket-matching.js";
import { applyTicketEvent, capPriority, initialTimeline, OPEN_STATUSES, TICKET_PRIORITY_LABEL, TICKET_STATUS_LABEL } from "../tickets/ticket-rules.js";
import { isOpenTicket, matchableTicketSelect } from "../tickets/ticket-service.js";
import { ConversationNotWithAgentError } from "./conversation-rules.js";

/** Inexistente, já usado ou de outro dono: a mesma resposta, para não revelar qual dos casos é. */
export class DraftNotFoundError extends Error {
  constructor() {
    super("Rascunho não encontrado");
    this.name = "DraftNotFoundError";
  }
}

export class DraftKindMismatchError extends Error {
  constructor() {
    super("Corpo da confirmação não corresponde ao rascunho");
    this.name = "DraftKindMismatchError";
  }
}

export class TicketNotOpenError extends Error {
  constructor() {
    super("Chamado não está aberto");
    this.name = "TicketNotOpenError";
  }
}

export type StoredAgentMessage = { id: string; content: string; trace: AgentTrace; createdAt: Date };

export type ConfirmedDraft = { message: StoredAgentMessage; ticket: TicketSummary };

type DraftTransaction = Prisma.TransactionClient;

const pendingDraftSelect = { id: true, status: true, pendingDraft: true } as const;

type LocatedDraft = { conversationId: string; draft: ConfirmableDraft };

/** Rascunho de um kind que não se confirma por aqui não existe para o cliente. */
async function locateDraft(client: Pick<DraftTransaction, "conversation">, ownerId: string, draftId: string): Promise<LocatedDraft> {
  const conversation = await client.conversation.findFirst({ where: { ownerId, pendingDraftId: draftId }, select: pendingDraftSelect });
  const draft = confirmableDraftSchema.safeParse(conversation?.pendingDraft);
  if (!conversation || !draft.success) throw new DraftNotFoundError();
  if (conversation.status !== "WITH_AGENT") throw new ConversationNotWithAgentError();
  return { conversationId: conversation.id, draft: draft.data };
}

export async function readPendingDraft(client: Pick<DraftTransaction, "conversation">, ownerId: string, draftId: string): Promise<ConfirmableDraft> {
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

type TurnScope = { tx: DraftTransaction; ownerId: string; conversationId: string; now: Date };

/** O prazo e o status seguem `applyTicketEvent`: comentário do funcionário só muda `updatedAt`. */
async function addComplement({ tx, ownerId, conversationId, now }: TurnScope, code: string, content: string): Promise<TicketSummary> {
  const ticket = await tx.ticket.findFirst({
    where: { code, ownerId, status: { in: [...OPEN_STATUSES] } },
    select: { ...matchableTicketSelect, id: true, slaStartedAt: true, resolvedAt: true, updatedAt: true },
  });
  if (!ticket || !isOpenTicket(ticket)) throw new TicketNotOpenError();

  // `now` é lido fora da transação: outra confirmação pode ter gravado um evento mais novo.
  const at = new Date(Math.max(now.getTime(), ticket.updatedAt.getTime()));
  const { next, eventDueAt } = applyTicketEvent(ticket, { type: "COMMENT", actorType: "EMPLOYEE", at }, at);
  await tx.ticketEvent.create({
    data: {
      ticketId: ticket.id,
      type: "COMMENT",
      actorType: "EMPLOYEE",
      actorId: ownerId,
      content,
      dueAt: eventDueAt,
      conversationId,
      createdAt: at,
    },
  });
  await tx.ticket.update({ where: { id: ticket.id }, data: { updatedAt: next.updatedAt } });
  return toTicketSummary(ticket, now);
}

async function confirmComplement(scope: TurnScope, draft: ComplementDraft, content: string): Promise<ConfirmedDraft> {
  const code = draft.ticketCode;
  const ticket = await addComplement(scope, code, content);
  const message = await writeAgentMessage(
    scope.tx,
    scope.conversationId,
    `Pronto, adicionei o complemento ao chamado ${code}.`,
    {
      understood: `Confirmação do complemento do chamado ${code}.`,
      intent: "COMPLEMENT",
      actions: [{ tool: "addTicketComplement", summary: `Registrou o complemento no chamado ${code}.`, status: "SUCCESS" }],
      confidence: "HIGH",
      reason: "Confirmação explícita do rascunho pendente.",
    },
    scope.now,
  );
  return { message, ticket };
}

type CreateRequest = Extract<ConfirmDraftRequest, { kind: "CREATE" }>;

/** Tipo, categoria e prioridade vêm do rascunho; o teto vale de novo porque o escopo pode ter sido editado. */
async function createTicket({ tx, ownerId, conversationId, now }: TurnScope, draft: CreateDraft, request: CreateRequest) {
  const priority = capPriority(draft.priority, request.affectedScope);
  // Sem linha no contador, o `update` lança e a transação inteira é desfeita.
  const { lastNumber } = await tx.ticketCounter.update({ where: { type: draft.type }, data: { lastNumber: { increment: 1 } } });
  const { next, eventDueAt } = initialTimeline({ type: draft.type, priority, at: now });
  const ticket = await tx.ticket.create({
    data: {
      code: `${draft.type}-${lastNumber}`,
      type: draft.type,
      category: draft.category,
      priority,
      status: next.status,
      title: request.title,
      description: request.description,
      affectedScope: request.affectedScope,
      // Texto de equipe ou filial não faz sentido se o escopo foi editado para uma pessoa só.
      affectedDescription: request.affectedScope === "INDIVIDUAL" ? null : (request.affectedDescription ?? null),
      ownerId,
      createdAt: now,
      updatedAt: next.updatedAt,
      slaStartedAt: next.slaStartedAt,
      dueAt: next.dueAt,
      events: {
        create: {
          type: "CREATED",
          actorType: "EMPLOYEE",
          actorId: ownerId,
          toStatus: next.status,
          dueAt: eventDueAt,
          conversationId,
          createdAt: now,
        },
      },
    },
    select: matchableTicketSelect,
  });
  if (!isOpenTicket(ticket) || !ticket.dueAt) throw new Error("Chamado novo fora do estado inicial");
  return { ...ticket, status: ticket.status, dueAt: ticket.dueAt };
}

function priorityNotice(draft: CreateDraft, priority: CreateDraft["priority"]): string {
  if (priority !== draft.priority) return ` A prioridade ficou ${TICKET_PRIORITY_LABEL[priority]} porque o problema afeta só você.`;
  return priority === "CRITICAL" ? ` A prioridade ficou ${TICKET_PRIORITY_LABEL[priority]}, com prazo de 1 hora.` : "";
}

async function confirmCreation(scope: TurnScope, draft: CreateDraft, request: CreateRequest): Promise<ConfirmedDraft> {
  const ticket = await createTicket(scope, draft, request);
  const message = await writeAgentMessage(
    scope.tx,
    scope.conversationId,
    `Chamado ${ticket.code} aberto. Status: ${TICKET_STATUS_LABEL[ticket.status]}. O prazo de atendimento é ${formatLocalDateTime(ticket.dueAt)}.` +
      priorityNotice(draft, ticket.priority),
    {
      understood: `Confirmação da abertura do chamado: ${ticket.title}.`,
      intent: "OPEN_TICKET",
      actions: [
        {
          tool: "createTicket",
          summary: `Abriu o ${ticket.code} com prioridade ${TICKET_PRIORITY_LABEL[ticket.priority]}.`,
          status: "SUCCESS",
        },
      ],
      confidence: "HIGH",
      reason: "Confirmação explícita do rascunho pendente.",
    },
    scope.now,
  );
  return { message, ticket: toTicketSummary(ticket, scope.now) };
}

export async function confirmPendingDraft(
  tx: DraftTransaction,
  { ownerId, draftId, request, now }: { ownerId: string; draftId: string; request: ConfirmDraftRequest; now: Date },
): Promise<ConfirmedDraft> {
  const { conversationId, draft } = await claimDraft(tx, ownerId, draftId, now);
  const scope = { tx, ownerId, conversationId, now };
  if (draft.kind === "COMPLEMENT" && request.kind === "COMPLEMENT") return confirmComplement(scope, draft, request.content);
  if (draft.kind === "CREATE" && request.kind === "CREATE") return confirmCreation(scope, draft, request);
  throw new DraftKindMismatchError();
}

function cancellationOf(draft: ConfirmableDraft): { content: string; trace: AgentTrace } {
  const shared = { confidence: "HIGH", reason: "Cancelamento explícito do rascunho pendente." } as const;
  if (draft.kind === "COMPLEMENT") {
    const code = draft.ticketCode;
    return {
      content: `Tudo bem, cancelei o complemento. O chamado ${code} não foi alterado.`,
      trace: {
        ...shared,
        understood: `Cancelamento do complemento do chamado ${code}.`,
        intent: "COMPLEMENT",
        actions: [{ tool: "addTicketComplement", summary: `Rascunho descartado; nada foi gravado no chamado ${code}.`, status: "SKIPPED" }],
      },
    };
  }
  return {
    content: "Tudo bem, cancelei a abertura do chamado. Nada foi registrado.",
    trace: {
      ...shared,
      understood: "Cancelamento da abertura do chamado.",
      intent: "OPEN_TICKET",
      actions: [{ tool: "createTicket", summary: "Rascunho descartado; nenhum chamado foi aberto.", status: "SKIPPED" }],
    },
  };
}

export async function cancelPendingDraft(
  tx: DraftTransaction,
  { ownerId, draftId, now }: { ownerId: string; draftId: string; now: Date },
): Promise<{ message: StoredAgentMessage }> {
  const { conversationId, draft } = await claimDraft(tx, ownerId, draftId, now);
  const { content, trace } = cancellationOf(draft);
  return { message: await writeAgentMessage(tx, conversationId, content, trace, now) };
}
