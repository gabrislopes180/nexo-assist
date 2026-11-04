import type { PrismaClient, Prisma } from "../generated/prisma/client.js";
import type { MessageAuthorType } from "../generated/prisma/enums.js";
import type { AgentTrace } from "../shared/transparency.js";
import { agentTraceSchema } from "../shared/transparency.js";
import { normalizeSearchText } from "../knowledge/search-text.js";
import { ConversationNotFoundError } from "./conversation-rules.js";
import { readEmployeeSnapshot, type EmployeeSnapshot } from "./employee-snapshot.js";
import { snapshotSelect, timelineMessageSelect, toTimelineMessage, type ConversationSnapshot, type TimelineMessage } from "./timeline.js";

/**
 * Leituras de conversa para o console e para o funcionário. Leem o banco direto, sem passar
 * pelo serviço de chamados resiliente: a lista não pode cair quando o legado simulado está fora.
 */

export const CONSOLE_LIST_LIMIT = 200;
export const CLOSED_VISIBLE_MS = 48 * 60 * 60 * 1000;

export type ConsoleFilter = "all" | "waiting" | "with-agent" | "mine";

type ListAuthorType = "EMPLOYEE" | "AGENT" | "ANALYST";

export type ConsoleRow = ConversationSnapshot & {
  lastMessage: { authorType: ListAuthorType; content: string; createdAt: Date } | null;
  lastAgentConfidence: AgentTrace["confidence"] | null;
  ticketCode: string | null;
};

type Reader = Pick<PrismaClient, "conversation" | "message" | "ticket" | "ticketEvent" | "user">;

const LIST_AUTHOR_TYPES = ["EMPLOYEE", "AGENT", "ANALYST"] as const satisfies readonly ListAuthorType[];

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

function isListAuthor(authorType: MessageAuthorType): authorType is ListAuthorType {
  return (LIST_AUTHOR_TYPES as readonly MessageAuthorType[]).includes(authorType);
}

type LatestKey = { conversationId: string; createdAt: Date };

/** As chaves (conversa, maior createdAt) de um `groupBy`; grupo sem conversa ou sem data fica de fora. */
function latestKeysOf(groups: ReadonlyArray<{ conversationId: string | null; _max: { createdAt: Date | null } }>): LatestKey[] {
  return groups.flatMap(({ conversationId, _max }) => (conversationId && _max.createdAt ? [{ conversationId, createdAt: _max.createdAt }] : []));
}

/** Entre as linhas no maior createdAt, a de maior id: o mesmo desempate de `orderBy [createdAt desc, id desc]`. */
function newestPerConversation<T extends { id: string; conversationId: string | null }>(rows: readonly T[]): Map<string, T> {
  const newest = new Map<string, T>();
  for (const row of rows) {
    if (!row.conversationId) continue;
    const current = newest.get(row.conversationId);
    if (!current || row.id > current.id) newest.set(row.conversationId, row);
  }
  return newest;
}

/*
 * "A última por conversa" em duas consultas que custam O(conversas): o `groupBy` acha o maior
 * createdAt de cada uma e a segunda lê só as linhas nesse instante, com os campos usados. O
 * `distinct` do Prisma carregava todas as linhas (com o trace inteiro) para descartar em memória.
 */

async function lastMessagesOf(client: Reader, ids: string[]) {
  const where = { conversationId: { in: ids }, authorType: { in: [...LIST_AUTHOR_TYPES] } };
  const groups = await client.message.groupBy({ by: ["conversationId"], where, _max: { createdAt: true } });
  const keys = latestKeysOf(groups);
  if (keys.length === 0) return new Map<string, { id: string; conversationId: string; authorType: ListAuthorType; content: string; createdAt: Date }>();
  const rows = await client.message.findMany({
    where: { ...where, OR: keys },
    select: { id: true, conversationId: true, authorType: true, content: true, createdAt: true },
  });
  return newestPerConversation(rows.flatMap(({ authorType, ...row }) => (isListAuthor(authorType) ? [{ ...row, authorType }] : [])));
}

async function lastAgentConfidencesOf(client: Reader, ids: string[]): Promise<Map<string, AgentTrace["confidence"] | null>> {
  const where = { conversationId: { in: ids }, authorType: "AGENT" } as const;
  const groups = await client.message.groupBy({ by: ["conversationId"], where, _max: { createdAt: true } });
  const keys = latestKeysOf(groups);
  if (keys.length === 0) return new Map();
  const rows = await client.message.findMany({ where: { ...where, OR: keys }, select: { id: true, conversationId: true, trace: true } });
  return new Map(
    [...newestPerConversation(rows)].map(([conversationId, row]) => {
      const trace = agentTraceSchema.safeParse(row.trace);
      return [conversationId, trace.success ? trace.data.confidence : null] as const;
    }),
  );
}

async function lastEventCodesOf(client: Reader, ids: string[]): Promise<Map<string, string>> {
  const groups = await client.ticketEvent.groupBy({ by: ["conversationId"], where: { conversationId: { in: ids } }, _max: { createdAt: true } });
  const keys = latestKeysOf(groups);
  if (keys.length === 0) return new Map();
  const rows = await client.ticketEvent.findMany({
    where: { OR: keys },
    select: { id: true, conversationId: true, ticket: { select: { code: true } } },
  });
  return new Map([...newestPerConversation(rows)].map(([conversationId, row]) => [conversationId, row.ticket.code] as const));
}

/**
 * Chamado da conversa: o do evento mais recente ligado a ela; sem evento, o primeiro código do
 * resumo da transferência que seja de um chamado do mesmo dono; senão, null.
 */
export async function ticketCodesFor(
  client: Reader,
  rows: ReadonlyArray<Pick<ConversationSnapshot, "id" | "handoffSummary"> & { owner: { id: string } }>,
): Promise<Map<string, string | null>> {
  const byEvent = await lastEventCodesOf(
    client,
    rows.map((row) => row.id),
  );

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
      lastMessage: last ? { authorType: last.authorType, content: last.content, createdAt: last.createdAt } : null,
      lastAgentConfidence: confidences.get(snapshot.id) ?? null,
      ticketCode: ticketCodes.get(snapshot.id) ?? null,
    };
  });
}

/** O termo normalizado no nome do dono ou no chamado derivado da conversa. */
function matchesSearch(row: ConsoleRow, term: string): boolean {
  return [row.owner.name, row.ticketCode ?? ""].some((text) => normalizeSearchText(text).includes(term));
}

/**
 * Pré-filtro de `q` no banco, mais largo que `matchesSearch`. O nome é comparado em memória sobre
 * os usuários (o SQLite não ignora acento) e vira `ownerId in`. O chamado derivado depende do
 * evento mais recente ou do dono do código citado no resumo, então o banco aceita qualquer evento
 * ou resumo com o termo (`contains` no SQLite ignora caixa em ASCII, e os códigos são ASCII).
 */
async function searchWhere(client: Reader, term: string): Promise<Prisma.ConversationWhereInput> {
  const users = await client.user.findMany({ select: { id: true, name: true } });
  const ownerIds = users.filter((user) => normalizeSearchText(user.name).includes(term)).map((user) => user.id);
  return {
    OR: [
      { ownerId: { in: ownerIds } },
      { ticketEvents: { some: { ticket: { code: { contains: term } } } } },
      { handoffSummary: { contains: term } },
    ],
  };
}

/**
 * Não encerradas mais as encerradas nas últimas 48 h, por `lastMessageAt` desc, cortadas em `limit`.
 * Com `q`, o banco pré-filtra e `matchesSearch` decide; lê páginas até juntar `limit`, para um
 * candidato que não casa não tirar da lista uma conversa mais antiga que casa.
 */
export async function listForConsole(
  client: Reader,
  { now, filter, analystId, q }: { now: Date; filter: ConsoleFilter; analystId: string; q?: string },
  limit = CONSOLE_LIST_LIMIT,
): Promise<ConsoleRow[]> {
  const term = q ? normalizeSearchText(q) : "";
  const conditions: Prisma.ConversationWhereInput[] = [
    { OR: [{ status: { not: "CLOSED" } }, { closedAt: { gte: new Date(now.getTime() - CLOSED_VISIBLE_MS) } }] },
    filterWhere(filter, analystId),
  ];
  if (term) conditions.push(await searchWhere(client, term));
  const page = (skip: number) =>
    client.conversation.findMany({
      where: { AND: conditions },
      orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
      skip,
      take: limit,
      select: snapshotSelect,
    });

  if (!term) return enrich(client, await page(0));
  // Por id: uma mensagem nova entre duas páginas desloca o offset e repetiria a linha.
  const matches = new Map<string, ConsoleRow>();
  for (let skip = 0; matches.size < limit; skip += limit) {
    const snapshots = await page(skip);
    for (const row of await enrich(client, snapshots)) if (matchesSearch(row, term) && !matches.has(row.id)) matches.set(row.id, row);
    if (snapshots.length < limit) break;
  }
  return [...matches.values()].slice(0, limit);
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
): Promise<EmployeeSnapshot> {
  const result = await readEmployeeSnapshot(client, ownerId, conversationId);
  if (!result) throw new ConversationNotFoundError();
  return result;
}

/** As leituras que os serviços recebem, para os testes poderem trocar o banco. */
export type ConversationQueries = {
  list(options: { now: Date; filter: ConsoleFilter; analystId: string; q?: string }): Promise<ConsoleRow[]>;
  find(conversationId: string): Promise<ConsoleRow>;
  messages(conversationId: string): Promise<TimelineMessage[]>;
  ownedByEmployee(ownerId: string, conversationId: string): Promise<EmployeeSnapshot>;
  activeForEmployee(ownerId: string): Promise<EmployeeSnapshot | null>;
};

export function createConversationQueries(client: PrismaClient): ConversationQueries {
  return {
    list: (options) => listForConsole(client, options),
    find: (conversationId) => findForConsole(client, conversationId),
    messages: (conversationId) => listMessages(client, conversationId),
    ownedByEmployee: (ownerId, conversationId) => client.$transaction((tx) => findOwnedForEmployee(tx, ownerId, conversationId)),
    activeForEmployee: (ownerId) => client.$transaction((tx) => readEmployeeSnapshot(tx, ownerId)),
  };
}
