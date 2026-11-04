import { QueryClient, type QueryKey } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { consoleConversationKeys } from "@/entities/conversation";
import { consoleMessagesKey } from "@/entities/message";
import { consoleTicketKeys } from "@/entities/ticket";
import { applyConsoleEvent } from "./apply-console-event";

const client = () => new QueryClient();
const invalidated = (qc: QueryClient, key: QueryKey) =>
  qc.getQueryState(key)?.isInvalidated ?? false;

const conversation = {
  id: "c1",
  status: "WITH_ANALYST",
  owner: { id: "u1", name: "Ana Souza", department: null },
  analyst: { id: "a1", name: "Rafael Lima" },
  assignedToMe: false,
  assignedAt: "2026-11-03T10:12:00.000Z",
  handoffReason: "EMPLOYEE_REQUEST",
  handoffSummary: null,
  handoffAt: "2026-11-03T10:05:00.000Z",
  lastMessageAt: "2026-11-03T10:12:00.000Z",
  closedAt: null,
  messageCount: 2,
  messageLimit: 30,
  lastMessage: null,
  lastAgentConfidence: null,
  ticketCode: null,
};

const message = {
  id: "m2",
  authorType: "SYSTEM",
  author: null,
  content: "Rafael assumiu a conversa",
  createdAt: "2026-11-03T10:12:00.000Z",
  trace: null,
  systemKind: "TAKEOVER",
};

const ticketsKey = consoleTicketKeys.byConversation("c1");
const detailKey = consoleTicketKeys.detail("INC-20405");

function seeded() {
  const qc = client();
  qc.setQueryData(consoleConversationKeys.list(), [
    { ...conversation, status: "WAITING_ANALYST", analyst: null },
  ]);
  qc.setQueryData(consoleMessagesKey("c1"), []);
  qc.setQueryData(ticketsKey, { conversationTicket: null, otherTickets: [] });
  qc.setQueryData(detailKey, { code: "INC-20405" });
  return qc;
}

describe("applyConsoleEvent", () => {
  it("sync RESYNC invalida tudo do console", () => {
    const qc = seeded();

    applyConsoleEvent(qc, "sync", { mode: "RESYNC" });

    expect(invalidated(qc, consoleConversationKeys.list())).toBe(true);
    expect(invalidated(qc, consoleMessagesKey("c1"))).toBe(true);
    expect(invalidated(qc, ticketsKey)).toBe(true);
  });

  it("sync REPLAY não invalida nada", () => {
    const qc = seeded();

    applyConsoleEvent(qc, "sync", { mode: "REPLAY" });

    expect(invalidated(qc, consoleConversationKeys.list())).toBe(false);
  });

  it("message.created anexa a mensagem da conversa", () => {
    const qc = seeded();

    applyConsoleEvent(qc, "message.created", { conversationId: "c1", message });
    applyConsoleEvent(qc, "message.created", { conversationId: "c1", message });

    expect(qc.getQueryData(consoleMessagesKey("c1"))).toEqual([message]);
  });

  it("conversation.updated troca a conversa na lista", () => {
    const qc = seeded();

    applyConsoleEvent(qc, "conversation.updated", { conversation });

    expect(qc.getQueryData(consoleConversationKeys.list())).toEqual([
      conversation,
    ]);
  });

  it("tickets.changed invalida só os chamados", () => {
    const qc = seeded();

    applyConsoleEvent(qc, "tickets.changed", {
      conversationId: "c1",
      ownerId: "u1",
    });

    expect(invalidated(qc, ticketsKey)).toBe(true);
    expect(invalidated(qc, consoleConversationKeys.list())).toBe(false);
  });

  it("tickets.changed sem conversa invalida também o detalhe do chamado", () => {
    const qc = seeded();

    applyConsoleEvent(qc, "tickets.changed", {
      conversationId: null,
      ownerId: "u1",
      ticketCode: "INC-20405",
    });

    expect(invalidated(qc, detailKey)).toBe(true);
    expect(invalidated(qc, ticketsKey)).toBe(true);
  });

  it("tickets.changed fora do formato ainda invalida os chamados", () => {
    const qc = seeded();

    applyConsoleEvent(qc, "tickets.changed", { algo: 1 });

    expect(invalidated(qc, detailKey)).toBe(true);
  });

  it("ignora evento fora do schema ou desconhecido", () => {
    const qc = seeded();
    const before = qc.getQueryData(consoleConversationKeys.list());

    applyConsoleEvent(qc, "conversation.updated", { conversation: { id: 1 } });
    applyConsoleEvent(qc, "message.created", { message });
    applyConsoleEvent(qc, "sync", { mode: "OUTRO" });
    applyConsoleEvent(qc, "algo.novo", {});

    expect(qc.getQueryData(consoleConversationKeys.list())).toBe(before);
    expect(qc.getQueryData(consoleMessagesKey("c1"))).toEqual([]);
    expect(invalidated(qc, consoleConversationKeys.list())).toBe(false);
  });
});
