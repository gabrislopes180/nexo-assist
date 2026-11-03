import type { PrismaClient, Prisma } from "../generated/prisma/client.js";
import type { AgentTrace } from "../shared/transparency.js";
import { agentTraceSchema } from "../shared/transparency.js";
import { normalizeSearchText } from "../knowledge/search-text.js";
import { ConversationNotFoundError } from "./conversation-rules.js";
import { snapshotSelect, timelineMessageSelect, toTimelineMessage, type ConversationSnapshot, type TimelineMessage } from "./timeline.js";

/**
 * Leituras de conversa para o console e para o funcionário. Leem o banco direto, sem passar
 * pelo serviço de chamados resiliente: a lista não pode cair quando o legado simulado está fora.
 */

export const CONSOLE_LIST_LIMIT = 200;
export const CLOSED_VISIBLE_MS = 48 * 60 * 60 * 1000;

export type ConsoleFilter = "all" | "waiting" | "with-agent" | "mine";

export type ConsoleRow = ConversationSnapshot & {
  lastMessage: { authorType: "EMPLOYEE" | "AGENT" | "ANALYST"; content: string; createdAt: Date } | null;
  lastAgentConfidence: AgentTrace["confidence"] | null;
  ticketCode: string | null;
};

type Reader = Pick<PrismaClient, "conversation" | "message" | "ticket" | "ticketEvent">;

const TICKET_CODE_PATTERN = /\b(INC|REQ)-\d+\b/gi;

function filterWhere(filter: ConsoleFilter, analystId: string): Prisma.ConversationWhereInput {
  switch (filter) {
    case "waiting":
      return { status: "WAITING_ANALYST" };
    case "with-agent":
      return { status: "WITH_AGENT" };
    case "mine":
      return { status: "WITH_ANALYST", analystId };
    case "all":
      return {};
  }
}

async function lastMessagesOf(client: Reader, ids: string[]) {
  const rows = await client.message.findMany({
    where: { conversationId: { in: ids }, authorType: { in: ["EMPLOYEE", "AGENT", "ANALYST"] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    distinct: ["conversationId"],
    select: { conversationId: true, authorType: true, content: true, createdAt: true },
  });
  return new Map(rows.map((row) => [row.conversationId, row] as const));
}

async function lastAgentConfidencesOf(client: Reader, ids: string[]) {
  const rows = await client.message.findMany({
    where: { conversationId: { in: ids }, authorType: "AGENT" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    distinct: ["conversationId"],
    select: { conversationId: true, trace: true },
  });
  return new Map(
    rows.map((row) => {
      const trace = agentTraceSchema.safeParse(row.trace);
      return [row.conversationId, trace.success ? trace.data.confidence : null] as const;
    }),
  );
}

/**
 * Chamado da conversa: o do evento mais recente ligado a ela; sem evento, o primeiro código do
 * resumo da transferência que seja de um chamado do mesmo dono; senão, null.
 */
export async function ticketCodesFor(
  client: Reader,
  rows: ReadonlyArray<Pick<ConversationSnapshot, "id" | "handoffSummary"> & { owner: { id: string } }>,
): Promise<Map<string, string | null>> {
  const ids = rows.map((row) => row.id);
  const events = await client.ticketEvent.findMany({
    where: { conversationId: { in: ids } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    distinct: ["conversationId"],
    select: { conversationId: true, ticket: { select: { code: true } } },
  });
  const byEvent = new Map(events.map((event) => [event.conversationId ?? "", event.ticket.code] as const));

  const candidates = new Map<string, string[]>();
  for (const row of rows) {
    if (byEvent.has(row.id) || !row.handoffSummary) continue;
    candidates.set(row.id, [...row.handoffSummary.matchAll(TICKET_CODE_PATTERN)].map((match) => match[0].toUpperCase()));
  }
  const codes = [...new Set([...candidates.values()].flat())];
  const owned = codes.length
    ? await client.ticket.findMany({ where: { code: { in: codes } }, select: { code: true, ownerId: true } })
    : [];
  const ownerOf = new Map(owned.map((ticket) => [ticket.code, ticket.ownerId] as const));

  return new Map(
    rows.map((row) => {
      const fromEvent = byEvent.get(row.id);
      if (fromEvent) return [row.id, fromEvent] as const;
      const fromSummary = candidates.get(row.id)?.find((code) => ownerOf.get(code) === row.owner.id);
      return [row.id, fromSummary ?? null] as const;
    }),
  );
}

async function enrich(client: Reader, snapshots: ConversationSnapshot[]): Promise<ConsoleRow[]> {
  const ids = snapshots.map((snapshot) => snapshot.id);
  const [lastMessages, confidences, ticketCodes] = await Promise.all([
    lastMessagesOf(client, ids),
    lastAgentConfidencesOf(client, ids),
    ticketCodesFor(client, snapshots),
  ]);
  return snapshots.map((snapshot) => {
    const last = lastMessages.get(snapshot.id);
    return {
      ...snapshot,
      lastMessage:
        last && last.authorType !== "SYSTEM"
          ? { authorType: last.authorType, content: last.content, createdAt: last.createdAt }
          : null,
      lastAgentConfidence: confidences.get(snapshot.id) ?? null,
      ticketCode: ticketCodes.get(snapshot.id) ?? null,
    };
  });
}

/**
 * Não encerradas mais as encerradas nas últimas 48 h, por `lastMessageAt` desc, cortadas em 200
 * no banco. A busca `q` roda em memória depois de derivar o chamado: o SQLite não ignora acento.
 */
export async function listForConsole(
  client: Reader,
  { now, filter, analystId, q }: { now: Date; filter: ConsoleFilter; analystId: string; q?: string },
): Promise<ConsoleRow[]> {
  const snapshots = await client.conversation.findMany({
    where: {
      AND: [
        { OR: [{ status: { not: "CLOSED" } }, { closedAt: { gte: new Date(now.getTime() - CLOSED_VISIBLE_MS) } }] },
        filterWhere(filter, analystId),
      ],
    },
    orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
    take: CONSOLE_LIST_LIMIT,
    select: snapshotSelect,
  });
  const rows = await enrich(client, snapshots);
  const term = q ? normalizeSearchText(q) : "";
  if (!term) return rows;
  return rows.filter((row) => normalizeSearchText(`${row.owner.name} ${row.ticketCode ?? ""}`).includes(term));
}

export async function findForConsole(client: Reader, conversationId: string): Promise<ConsoleRow> {
  const snapshot = await client.conversation.findUnique({ where: { id: conversationId }, select: snapshotSelect });
  if (!snapshot) throw new ConversationNotFoundError();
  const [row] = await enrich(client, [snapshot]);
  if (!row) throw new ConversationNotFoundError();
  return row;
}

/** Todas as mensagens, por `createdAt` e `id`, para o desempate estável. */
export async function listMessages(client: Reader, conversationId: string): Promise<TimelineMessage[]> {
  const exists = await client.conversation.findUnique({ where: { id: conversationId }, select: { id: true } });
  if (!exists) throw new ConversationNotFoundError();
  const rows = await client.message.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: timelineMessageSelect,
  });
  return rows.map(toTimelineMessage);
}

/** Conversa de outro dono responde igual a inexistente. */
export async function findOwnedForEmployee(
  client: Reader,
  ownerId: string,
  conversationId: string,
): Promise<{ snapshot: ConversationSnapshot; messages: TimelineMessage[] }> {
  const snapshot = await client.conversation.findFirst({ where: { id: conversationId, ownerId }, select: snapshotSelect });
  if (!snapshot) throw new ConversationNotFoundError();
  return { snapshot, messages: await listMessages(client, conversationId) };
}

/** As leituras que os serviços recebem, para os testes poderem trocar o banco. */
export type ConversationQueries = {
  list(options: { now: Date; filter: ConsoleFilter; analystId: string; q?: string }): Promise<ConsoleRow[]>;
  find(conversationId: string): Promise<ConsoleRow>;
  messages(conversationId: string): Promise<TimelineMessage[]>;
  ownedByEmployee(ownerId: string, conversationId: string): Promise<{ snapshot: ConversationSnapshot; messages: TimelineMessage[] }>;
};

export function createConversationQueries(client: Reader): ConversationQueries {
  return {
    list: (options) => listForConsole(client, options),
    find: (conversationId) => findForConsole(client, conversationId),
    messages: (conversationId) => listMessages(client, conversationId),
    ownedByEmployee: (ownerId, conversationId) => findOwnedForEmployee(client, ownerId, conversationId),
  };
}
