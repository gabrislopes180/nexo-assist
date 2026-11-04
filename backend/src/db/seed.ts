import { closeSystemMessage, RETURN_SYSTEM_MESSAGE, takeoverSystemMessage } from "../conversations/attendance.js";
import { CONVERSATION_MESSAGE_LIMIT } from "../conversations/conversation-rules.js";
import { HANDOFF_SYSTEM_MESSAGE } from "../conversations/handoff.js";
import type { SystemMessageKind, TicketType } from "../generated/prisma/enums.js";
import { normalizeSearchText } from "../knowledge/search-text.js";
import { agentTraceSchema } from "../shared/transparency.js";
import { isOverdue } from "../tickets/sla.js";
import {
  applyTicketEvent,
  canReopen,
  initialTimeline,
  type TicketEventInput,
  type TicketTimeline,
} from "../tickets/ticket-rules.js";
import { prisma, type DbTransaction } from "./prisma.js";
import { ARTICLES } from "./seed-data/articles.js";
import { agentQuotaUsed, buildConversations, NEAR_LIMIT_CONVERSATION_ID, type ConversationKey } from "./seed-data/conversations.js";
import { buildTickets, type TicketSeed } from "./seed-data/tickets.js";
import { USERS, type UserKey } from "./seed-data/users.js";

/**
 * Seed da demo. Reexecutável sem `migrate reset`: apaga tudo e reinsere numa única
 * transação. Os tempos são relativos a `now`, então os prazos (vencido / no prazo)
 * valem em qualquer dia em que o seed rodar.
 */

const EXPECTED_OVERDUE: Record<string, boolean> = {
  "INC-20311": true,
  "REQ-10442": true,
  "INC-20402": false,
  "INC-20398": false,
  "INC-20405": false,
  "INC-20410": false,
  "REQ-10460": false,
};

const EXPECTED_CAN_REOPEN: Record<string, boolean> = {
  "INC-20150": true,
  "INC-19987": false,
};

type StoredEvent = TicketEventInput & { dueAt: Date | null };

type Replayed = {
  timeline: TicketTimeline;
  events: Array<TicketSeed["events"][number] & ReturnType<typeof eventResult>>;
};

function eventResult(fromStatus: TicketTimeline["status"] | null, fromPriority: TicketTimeline["priority"] | null, dueAt: Date | null) {
  return { fromStatus, fromPriority, eventDueAt: dueAt };
}

/** Reaplica os eventos com as regras de domínio (now = instante de cada evento). */
function replay(type: TicketType, priority: TicketTimeline["priority"], events: readonly StoredEvent[]): {
  timeline: TicketTimeline;
  results: Array<ReturnType<typeof eventResult>>;
} {
  const [first, ...rest] = events;
  if (!first || first.type !== "CREATED") throw new Error("O primeiro evento precisa ser CREATED");
  const init = initialTimeline({ type, priority, at: first.at });
  let timeline = init.next;
  const results = [eventResult(null, null, init.eventDueAt)];
  for (const event of rest) {
    const r = applyTicketEvent(timeline, event, event.at);
    timeline = r.next;
    results.push(eventResult(r.fromStatus, r.fromPriority, r.eventDueAt));
  }
  return { timeline, results };
}

function buildTicket(seed: TicketSeed): Replayed {
  // seed.priority é a prioridade na criação; PRIORITY_CHANGED (se houver) altera a partir daí.
  const { timeline, results } = replay(seed.type, seed.priority, seed.events.map((e) => ({ ...e, dueAt: null })));
  return {
    timeline,
    events: seed.events.map((e, i) => {
      const r = results[i];
      if (!r) throw new Error("Resultado de evento ausente");
      return { ...e, ...r };
    }),
  };
}

const sameTime = (a: Date | null, b: Date | null) => (a === null || b === null ? a === b : a.getTime() === b.getTime());

function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Seed inconsistente: ${message}`);
}

async function clear(tx: DbTransaction) {
  await tx.message.deleteMany();
  await tx.ticketEvent.deleteMany();
  await tx.ticket.deleteMany();
  await tx.conversation.deleteMany();
  await tx.article.deleteMany();
  await tx.ticketCounter.deleteMany();
  await tx.user.deleteMany();
}

async function seed(tx: DbTransaction, now: Date) {
  await clear(tx);

  // Usuários
  const userId = {} as Record<UserKey, string>;
  for (const { key, ...data } of USERS) {
    const user = await tx.user.create({ data: { ...data, createdAt: new Date(now.getTime() - 90 * 86_400_000) } });
    userId[key] = user.id;
  }
  const idOf = (key: UserKey | null | undefined) => (key ? userId[key] : null);

  // Artigos
  for (const a of ARTICLES) {
    const keywords = a.keywords.map((k) => k.toLowerCase()).join(", ");
    await tx.article.create({
      data: {
        slug: a.slug,
        title: a.title,
        content: a.content,
        category: a.category,
        keywords,
        searchText: normalizeSearchText(`${a.title} ${keywords} ${a.content}`),
      },
    });
  }

  // Chamados em memória (estado final derivado das regras)
  const ticketSeeds = buildTickets(now);
  const built = new Map(ticketSeeds.map((s) => [s.code, buildTicket(s)] as const));
  const creationDueAt = (code: string): Date => {
    const due = built.get(code)?.events[0]?.eventDueAt;
    if (!due) throw new Error(`Chamado ${code} sem prazo inicial`);
    return due;
  };

  // Conversas e mensagens
  const conversationId = {} as Record<ConversationKey, string>;
  for (const c of buildConversations(now, creationDueAt)) {
    const first = c.messages[0];
    const last = c.messages[c.messages.length - 1];
    check(first !== undefined && last !== undefined, `conversa ${c.key} sem mensagens`);
    const conversation = await tx.conversation.create({
      data: {
        ...(c.id ? { id: c.id } : {}),
        ownerId: userId[c.ownerKey],
        status: c.status,
        analystId: idOf(c.analystKey),
        handoffReason: c.handoffReason ?? null,
        handoffSummary: c.handoffSummary ?? null,
        handoffAt: c.handoffAt ?? null,
        closedAt: c.closedAt ?? null,
        assignedAt: c.assignedAt ?? null,
        returnedToAgentAt: c.returnedToAgentAt ?? null,
        messageCount: agentQuotaUsed(c.messages),
        pendingDraft: undefined, // null no banco
        pendingDraftId: null,
        lastMessageAt: last.at,
        createdAt: first.at,
        updatedAt: c.closedAt ?? last.at,
        messages: {
          create: c.messages.map((m) => ({
            authorType: m.authorType,
            authorId: idOf(m.authorKey),
            content: m.content,
            trace: m.trace,
            systemKind: m.systemKind ?? null,
            createdAt: m.at,
          })),
        },
      },
    });
    conversationId[c.key] = conversation.id;
  }

  // Chamados e eventos
  for (const s of ticketSeeds) {
    const b = built.get(s.code);
    check(b !== undefined, `chamado ${s.code} não construído`);
    const { timeline } = b;
    const created = b.events[0];
    check(created !== undefined, `chamado ${s.code} sem eventos`);
    await tx.ticket.create({
      data: {
        code: s.code,
        type: s.type,
        category: s.category,
        priority: timeline.priority,
        status: timeline.status,
        title: s.title,
        description: s.description,
        affectedScope: s.affectedScope,
        affectedDescription: s.affectedDescription ?? null,
        ownerId: userId[s.ownerKey],
        createdAt: created.at,
        updatedAt: timeline.updatedAt,
        resolvedAt: timeline.resolvedAt,
        slaStartedAt: timeline.slaStartedAt,
        dueAt: timeline.dueAt,
        events: {
          create: b.events.map((e) => ({
            type: e.type,
            actorType: e.actorType,
            actorId: idOf(e.actorKey),
            content: e.content ?? null,
            fromStatus: e.fromStatus,
            toStatus: e.type === "CREATED" ? "WAITING_ANALYST" : (e.toStatus ?? null),
            fromPriority: e.fromPriority,
            toPriority: e.toPriority ?? null,
            dueAt: e.eventDueAt,
            conversationId: e.conversationKey ? conversationId[e.conversationKey] : null,
            createdAt: e.at,
          })),
        },
      },
    });
  }

  // Contadores = maior número usado por tipo
  const maxNumber = (type: TicketType) =>
    Math.max(...ticketSeeds.filter((s) => s.type === type).map((s) => Number(s.code.split("-")[1])));
  for (const type of ["INC", "REQ"] as const) {
    await tx.ticketCounter.create({ data: { type, lastNumber: maxNumber(type) } });
  }

  await verify(tx, now);
}

/** Relê o banco e confere as invariantes; qualquer falha desfaz a transação. */
async function verify(tx: DbTransaction, now: Date) {
  const tickets = await tx.ticket.findMany({ include: { events: { orderBy: { createdAt: "asc" } } } });

  for (const t of tickets) {
    const [first] = t.events;
    check(first?.type === "CREATED", `${t.code}: primeiro evento não é CREATED`);
    const last = t.events[t.events.length - 1];
    check(last !== undefined && sameTime(t.updatedAt, last.createdAt), `${t.code}: updatedAt ≠ último evento`);

    const priorityAtCreation = t.events.find((e) => e.type === "PRIORITY_CHANGED")?.fromPriority ?? t.priority;
    const { timeline, results } = replay(
      t.type,
      priorityAtCreation,
      t.events.map((e) => ({
        type: e.type,
        actorType: e.actorType,
        at: e.createdAt,
        dueAt: e.dueAt,
        ...(e.toStatus ? { toStatus: e.toStatus } : {}),
        ...(e.toPriority ? { toPriority: e.toPriority } : {}),
      })),
    );
    check(timeline.status === t.status, `${t.code}: status ${t.status} ≠ ${timeline.status}`);
    check(timeline.priority === t.priority, `${t.code}: prioridade divergente`);
    check(sameTime(timeline.dueAt, t.dueAt), `${t.code}: dueAt divergente`);
    check(sameTime(timeline.slaStartedAt, t.slaStartedAt), `${t.code}: slaStartedAt divergente`);
    check(sameTime(timeline.resolvedAt, t.resolvedAt), `${t.code}: resolvedAt divergente`);
    t.events.forEach((e, i) => {
      const r = results[i];
      check(r !== undefined && sameTime(r.eventDueAt, e.dueAt), `${t.code}: dueAt do evento ${e.type} divergente`);
      check(r.fromStatus === e.fromStatus, `${t.code}: fromStatus do evento ${e.type} divergente`);
    });

    if (t.status === "RESOLVED") {
      check(t.dueAt === null && t.resolvedAt !== null, `${t.code}: RESOLVED exige dueAt null e resolvedAt preenchido`);
    } else {
      check(t.resolvedAt === null, `${t.code}: aberto com resolvedAt preenchido`);
      if (t.status !== "WAITING_EMPLOYEE") check(t.dueAt !== null, `${t.code}: aberto sem prazo`);
    }
    if (t.status === "WAITING_EMPLOYEE") check(t.dueAt === null, `${t.code}: WAITING_EMPLOYEE com prazo`);
  }

  const roles = new Map((await tx.user.findMany({ select: { id: true, role: true } })).map((u) => [u.id, u.role] as const));
  for (const t of tickets) {
    for (const e of t.events) {
      if (e.actorType === "ANALYST") check(e.actorId !== null && roles.get(e.actorId) === "ANALYST", `${t.code}: evento ${e.type} de ANALYST sem autor analista`);
      if (e.actorType === "EMPLOYEE") check(e.actorId === t.ownerId, `${t.code}: evento ${e.type} de EMPLOYEE que não é do dono`);
      if (e.actorType === "AGENT" || e.actorType === "SYSTEM") check(e.actorId === null, `${t.code}: evento ${e.type} de ${e.actorType} com autor`);
    }
  }

  const byCode = new Map(tickets.map((t) => [t.code, t] as const));
  const ticket = (code: string) => {
    const t = byCode.get(code);
    check(t !== undefined, `chamado ${code} ausente`);
    return t;
  };
  for (const [code, expected] of Object.entries(EXPECTED_OVERDUE)) {
    check(isOverdue(ticket(code), now) === expected, `${code}: isOverdue deveria ser ${expected}`);
  }
  for (const [code, expected] of Object.entries(EXPECTED_CAN_REOPEN)) {
    check(canReopen(ticket(code), now) === expected, `${code}: canReopen deveria ser ${expected}`);
  }

  const conversations = await tx.conversation.findMany({ include: { messages: { orderBy: { createdAt: "asc" } } } });
  for (const c of conversations) {
    const quota = agentQuotaUsed(c.messages);
    check(c.messageCount === quota, `conversa ${c.id}: messageCount ${c.messageCount} ≠ ${quota} (mensagens ao agent)`);
    const last = c.messages[c.messages.length - 1];
    check(last !== undefined && sameTime(c.lastMessageAt, last.createdAt), `conversa ${c.id}: lastMessageAt divergente`);
    check(c.pendingDraft === null, `conversa ${c.id}: pendingDraft deveria ser null`);
    for (const m of c.messages) {
      if (m.authorType === "AGENT") {
        const parsed = agentTraceSchema.safeParse(m.trace);
        check(parsed.success, `mensagem ${m.id}: trace inválido (${parsed.error?.message ?? ""})`);
      } else {
        check(m.trace === null, `mensagem ${m.id}: trace só em mensagens do AGENT`);
      }
      if (m.authorType === "AGENT" || m.authorType === "SYSTEM") check(m.authorId === null, `mensagem ${m.id}: autor deveria ser null`);
      check((m.authorType === "SYSTEM") === (m.systemKind !== null), `mensagem ${m.id}: systemKind só e sempre em SYSTEM`);
    }
  }

  for (const c of conversations.filter((conversation) => conversation.handoffAt !== null)) {
    const handoffAt = c.handoffAt;
    const marker = c.messages.some((m) => m.systemKind === "HANDOFF" && m.content === HANDOFF_SYSTEM_MESSAGE && sameTime(m.createdAt, handoffAt));
    check(marker, `conversa ${c.id}: sem mensagem de transferência em handoffAt`);
  }

  const users = new Map((await tx.user.findMany({ select: { id: true, name: true, role: true } })).map((u) => [u.id, u] as const));
  for (const c of conversations) {
    const hasSystem = (kind: SystemMessageKind, content: string, at: Date | null) =>
      at !== null && c.messages.some((m) => m.systemKind === kind && m.content === content && sameTime(m.createdAt, at));
    const handoffFilled = c.handoffReason !== null && c.handoffSummary !== null && c.handoffAt !== null;
    const analyst = c.analystId ? users.get(c.analystId) : undefined;
    if (c.status === "WAITING_ANALYST") {
      check(c.analystId === null && c.assignedAt === null && handoffFilled, `conversa ${c.id}: WAITING_ANALYST com analista ou sem transferência`);
    }
    if (c.status === "WITH_ANALYST") {
      check(analyst !== undefined && c.assignedAt !== null && handoffFilled, `conversa ${c.id}: WITH_ANALYST sem analista, assignedAt ou transferência`);
      check(hasSystem("TAKEOVER", takeoverSystemMessage(analyst.name), c.assignedAt), `conversa ${c.id}: sem a SYSTEM de quem assumiu em assignedAt`);
    }
    if (c.status === "WITH_AGENT") {
      const clean = c.analystId === null && c.assignedAt === null && c.handoffReason === null && c.handoffSummary === null && c.handoffAt === null;
      check(clean, `conversa ${c.id}: WITH_AGENT com analista ou transferência`);
    }
    if (c.status === "CLOSED") {
      check(c.closedAt !== null, `conversa ${c.id}: CLOSED sem closedAt`);
      if (c.analystId !== null) {
        check(analyst !== undefined && hasSystem("CLOSED", closeSystemMessage(analyst.name), c.closedAt), `conversa ${c.id}: sem a SYSTEM de encerramento em closedAt`);
      }
    }
    if (c.returnedToAgentAt !== null) {
      check(hasSystem("RETURNED", RETURN_SYSTEM_MESSAGE, c.returnedToAgentAt), `conversa ${c.id}: sem a SYSTEM de devolução em returnedToAgentAt`);
    }
    for (const m of c.messages.filter((message) => message.authorType === "ANALYST")) {
      check(m.authorId !== null && users.get(m.authorId)?.role === "ANALYST", `mensagem ${m.id}: ANALYST sem autor analista`);
    }
  }

  for (const reason of ["EMPLOYEE_REQUEST", "LOW_CONFIDENCE", "CRITICAL", "OVERDUE"] as const) {
    const waiting = conversations.find((c) => c.status === "WAITING_ANALYST" && c.handoffReason === reason);
    check(waiting !== undefined && waiting.handoffSummary !== null && waiting.handoffAt !== null, `sem conversa aguardando analista por ${reason}`);
  }

  // Demo da gestão de chamados: um chamado na fila ligado a uma conversa que um analista já assumiu.
  const assumed = new Set(conversations.filter((c) => c.status === "WITH_ANALYST").map((c) => c.id));
  const demoTicket = tickets.find(
    (t) => t.status === "WAITING_ANALYST" && t.events.some((e) => e.conversationId !== null && assumed.has(e.conversationId)),
  );
  check(demoTicket !== undefined, "sem chamado WAITING_ANALYST ligado a conversa WITH_ANALYST");

  const nearLimit = conversations.find((c) => c.id === NEAR_LIMIT_CONVERSATION_ID);
  check(nearLimit?.status === "WITH_AGENT" && nearLimit.messageCount === CONVERSATION_MESSAGE_LIMIT - 1, "conversa perto do limite divergente");

  const counters = await tx.ticketCounter.findMany();
  for (const type of ["INC", "REQ"] as const) {
    const used = Math.max(...tickets.filter((t) => t.type === type).map((t) => Number(t.code.split("-")[1])));
    const counter = counters.find((c) => c.type === type);
    check(counter?.lastNumber === used, `contador ${type} deveria ser ${used}`);
  }
}

async function main() {
  const now = new Date();
  await prisma.$transaction((tx) => seed(tx, now), { timeout: 30_000 });

  const [users, articles, tickets, events, conversations, messages] = await Promise.all([
    prisma.user.count(),
    prisma.article.count(),
    prisma.ticket.count(),
    prisma.ticketEvent.count(),
    prisma.conversation.count(),
    prisma.message.count(),
  ]);
  console.log(
    `Seed concluído: ${users} usuários, ${articles} artigos, ${tickets} chamados, ${events} eventos, ` +
      `${conversations} conversas, ${messages} mensagens.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
