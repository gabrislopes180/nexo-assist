import type { TicketCategory, TicketPriority, TicketType } from "../generated/prisma/enums.js";
import { normalizeSearchText } from "../knowledge/search-text.js";
import type { TicketLookupCriteria, TicketSummary } from "../shared/chat.js";
import { isOverdue } from "./sla.js";
import { TICKET_CATEGORY_LABEL, TICKET_STATUS_LABEL, type OpenTicketStatus } from "./ticket-rules.js";

/** Match de chamados abertos (módulo puro, em memória, sobre os chamados do dono). */

export const MAX_LOOKUP_TICKETS = 5;

export type MatchableTicket = {
  code: string;
  type: TicketType;
  category: TicketCategory;
  priority: TicketPriority;
  status: OpenTicketStatus;
  title: string;
  description: string;
  createdAt: Date;
  dueAt: Date | null;
};

export type TicketMatches = { totalMatches: number; tickets: TicketSummary[] };

function matchesFilters(ticket: MatchableTicket, criteria: TicketLookupCriteria): boolean {
  return (
    (criteria.type === undefined || ticket.type === criteria.type) &&
    (criteria.category === undefined || ticket.category === criteria.category) &&
    (criteria.priority === undefined || ticket.priority === criteria.priority) &&
    (criteria.status === undefined || ticket.status === criteria.status)
  );
}

/** Keyword repetida não pontua duas vezes, e a só de espaços viraria "" e casaria com tudo. */
function normalizedKeywords(keywords: readonly string[]): string[] {
  return [...new Set(keywords.map(normalizeSearchText))].filter((keyword) => keyword !== "");
}

function keywordScore(ticket: MatchableTicket, keywords: readonly string[]): number {
  const text = normalizeSearchText(`${ticket.title} ${ticket.description} ${TICKET_CATEGORY_LABEL[ticket.category]}`);
  return keywords.filter((keyword) => text.includes(keyword)).length;
}

function bestKeywordMatches(tickets: readonly MatchableTicket[], rawKeywords: readonly string[]): readonly MatchableTicket[] {
  const keywords = normalizedKeywords(rawKeywords);
  if (keywords.length === 0) return [];
  const scored = tickets.map((ticket) => ({ ticket, score: keywordScore(ticket, keywords) }));
  const best = Math.max(0, ...scored.map(({ score }) => score));
  return best === 0 ? [] : scored.filter(({ score }) => score === best).map(({ ticket }) => ticket);
}

function selectMatches(tickets: readonly MatchableTicket[], criteria: TicketLookupCriteria): readonly MatchableTicket[] {
  if (criteria.code !== undefined) {
    const code = criteria.code.toUpperCase();
    return tickets.filter((ticket) => ticket.code.toUpperCase() === code);
  }
  const filtered = tickets.filter((ticket) => matchesFilters(ticket, criteria));
  return criteria.keywords ? bestKeywordMatches(filtered, criteria.keywords) : filtered;
}

/** Vencidos primeiro, `dueAt` crescente (nulos por último), `createdAt` decrescente, `code`. */
function byUrgency(now: Date) {
  return (a: MatchableTicket, b: MatchableTicket): number => {
    const overdue = Number(isOverdue(b, now)) - Number(isOverdue(a, now));
    if (overdue !== 0) return overdue;
    const dueA = a.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const dueB = b.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
    if (dueA !== dueB) return dueA < dueB ? -1 : 1;
    const created = b.createdAt.getTime() - a.createdAt.getTime();
    if (created !== 0) return created;
    return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
  };
}

export function toTicketSummary(ticket: MatchableTicket, now: Date): TicketSummary {
  return {
    code: ticket.code,
    type: ticket.type,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    statusLabel: TICKET_STATUS_LABEL[ticket.status],
    title: ticket.title,
    createdAt: ticket.createdAt.toISOString(),
    dueAt: ticket.dueAt?.toISOString() ?? null,
    overdue: isOverdue(ticket, now),
  };
}

export function matchTickets(tickets: readonly MatchableTicket[], criteria: TicketLookupCriteria, now: Date): TicketMatches {
  const matches = [...selectMatches(tickets, criteria)].sort(byUrgency(now));
  return {
    totalMatches: matches.length,
    tickets: matches.slice(0, MAX_LOOKUP_TICKETS).map((ticket) => toTicketSummary(ticket, now)),
  };
}
