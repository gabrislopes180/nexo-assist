import { normalizeSearch } from "@/shared/lib/normalize-search";
import type { ConsoleConversation } from "../model/console-conversation";

export type ConversationFilter = "all" | "waiting" | "with-agent" | "mine";

export const FILTER_LABELS: Record<ConversationFilter, string> = {
  all: "Todas",
  waiting: "Para você",
  "with-agent": "Com o agent",
  mine: "Minhas",
};

const isMine = (c: ConsoleConversation) =>
  c.status === "WITH_ANALYST" && c.assignedToMe;

export function matchesFilter(
  c: ConsoleConversation,
  filter: ConversationFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "waiting":
      return c.status === "WAITING_ANALYST";
    case "with-agent":
      return c.status === "WITH_AGENT";
    case "mine":
      return isMine(c);
  }
}

export function filterCounts(list: ConsoleConversation[]) {
  return {
    waiting: list.filter((c) => matchesFilter(c, "waiting")).length,
    "with-agent": list.filter((c) => matchesFilter(c, "with-agent")).length,
    mine: list.filter(isMine).length,
  };
}

export function matchesSearch(c: ConsoleConversation, query: string): boolean {
  const needle = normalizeSearch(query);
  if (!needle) return true;
  return [c.owner.name, c.ticketCode ?? ""].some((field) =>
    normalizeSearch(field).includes(needle),
  );
}

// Grupo 0: quem pede ação do analista (esperando ou atendida por ele).
const group = (c: ConsoleConversation) =>
  c.status === "WAITING_ANALYST" || isMine(c) ? 0 : 1;

export function sortConversations(
  list: ConsoleConversation[],
): ConsoleConversation[] {
  return [...list].sort(
    (a, b) =>
      group(a) - group(b) ||
      Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt),
  );
}

export function visibleConversations(
  list: ConsoleConversation[],
  filter: ConversationFilter,
  query: string,
): ConsoleConversation[] {
  return sortConversations(
    list.filter((c) => matchesFilter(c, filter) && matchesSearch(c, query)),
  );
}
