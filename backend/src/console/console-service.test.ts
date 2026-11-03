import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ConversationQueries } from "../conversations/conversation-queries.js";
import type { ConversationService } from "../conversations/conversation-service.js";
import type { SessionUser } from "../shared/session.js";
import type { OwnerTicketReader } from "../tickets/ticket-service.js";
import { AnalystOnlyError, createConsoleService } from "./console-service.js";

const NOW = new Date("2026-11-03T12:00:00.000Z");
const analyst: SessionUser = { id: "a1", name: "Bruno Martins", email: "b@teste.example", role: "ANALYST", department: null };
const reject = () => Promise.reject(new Error("não usado aqui"));
const conversations = {} as ConversationService;
const queries: ConversationQueries = { list: reject, find: reject, messages: reject, ownedByEmployee: reject };
const tickets: OwnerTicketReader = { listOwnerTickets: reject };

describe("ConsoleService", () => {
  it("recusa quem não é analista antes de qualquer leitura ou ação", async () => {
    const service = createConsoleService({ conversations, queries, tickets, now: () => NOW });
    const employee = { ...analyst, role: "EMPLOYEE" } as const;
    await assert.rejects(service.listConversations(employee, { filter: "all" }), AnalystOnlyError);
    await assert.rejects(service.getConversation(employee, "c"), AnalystOnlyError);
    await assert.rejects(service.getMessages(employee, "c"), AnalystOnlyError);
    await assert.rejects(service.getTickets(employee, "c"), AnalystOnlyError);
    await assert.rejects(service.takeOver(employee, "c"), AnalystOnlyError);
    await assert.rejects(service.reply(employee, "c", "oi"), AnalystOnlyError);
    await assert.rejects(service.returnToAgent(employee, "c"), AnalystOnlyError);
    await assert.rejects(service.close(employee, "c"), AnalystOnlyError);
  });

  it("passa o analista da sessão às ações, nunca um escolhido pelo cliente", async () => {
    const calls: unknown[][] = [];
    const recorder = {
      takeOver: (...args: unknown[]) => (calls.push(args), reject()),
    } as unknown as ConversationService;
    const service = createConsoleService({ conversations: recorder, queries, tickets, now: () => NOW });
    await assert.rejects(service.takeOver(analyst, "c1"));
    assert.deepEqual(calls, [["c1", { id: "a1", name: "Bruno Martins" }, NOW]]);
  });
});
