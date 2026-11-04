import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ConsoleRow } from "../conversations/conversation-queries.js";
import type { TimelineMessage } from "../conversations/timeline.js";
import { createEventBus, type BusEvent } from "./event-bus.js";
import { createFanout } from "./fanout.js";

const NOW = new Date("2026-11-03T12:00:00.000Z");

const message = (id: string, conversationId = "c1"): TimelineMessage => ({
  id,
  conversationId,
  authorType: "SYSTEM",
  systemKind: "HANDOFF",
  author: null,
  content: id,
  createdAt: NOW,
  trace: null,
});

const row = (id: string): ConsoleRow => ({
  id,
  status: "WITH_ANALYST",
  owner: { id: "u1", name: "Ana Souza", department: null },
  analyst: { id: "a1", name: "Bruno Martins" },
  messageCount: 1,
  handoffReason: "EMPLOYEE_REQUEST",
  handoffSummary: "s",
  handoffAt: NOW,
  assignedAt: NOW,
  returnedToAgentAt: null,
  lastMessageAt: NOW,
  closedAt: null,
  lastMessage: null,
  lastAgentConfidence: null,
  ticketCode: null,
});

function recordingBus() {
  const bus = createEventBus({ bootId: "boot01" });
  const events: BusEvent[] = [];
  bus.subscribe({ onEvent: (event) => events.push(event) });
  const summary = () => events.map((event) => `${event.type}:${event.conversationId}:${event.type === "message.created" ? event.data.id : ""}`);
  return { bus, events, summary };
}

describe("fan-out das mudanças", () => {
  it("publica message.created de cada mensagem, depois conversation.updated e então tickets.changed", async () => {
    const { bus, events, summary } = recordingBus();
    const fanout = createFanout({ bus, readConversation: (id) => Promise.resolve(row(id)) });
    fanout.publish({ conversationId: "c1", ownerId: "u1", messages: [message("m1"), message("m2")], ticketsChanged: true });
    await fanout.idle();
    assert.deepEqual(summary(), ["message.created:c1:m1", "message.created:c1:m2", "conversation.updated:c1:", "tickets.changed:c1:"]);
    assert.ok(events.every((event) => event.ownerId === "u1"));
    const updated = events[2];
    assert.equal(updated?.type === "conversation.updated" ? updated.data.id : null, "c1");
  });

  it("sem mudança de chamados, não publica tickets.changed", async () => {
    const { bus, summary } = recordingBus();
    const fanout = createFanout({ bus, readConversation: (id) => Promise.resolve(row(id)) });
    fanout.publish({ conversationId: "c1", ownerId: "u1", messages: [message("m1")], ticketsChanged: false });
    await fanout.idle();
    assert.deepEqual(summary(), ["message.created:c1:m1", "conversation.updated:c1:"]);
  });

  it("processa em série: a segunda mudança espera a leitura lenta da primeira", async () => {
    const { bus, summary } = recordingBus();
    let releaseFirst: () => void = () => undefined;
    const firstRead = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const fanout = createFanout({
      bus,
      readConversation: async (id) => {
        if (id === "c1") await firstRead;
        return row(id);
      },
    });
    fanout.publish({ conversationId: "c1", ownerId: "u1", messages: [message("m1", "c1")], ticketsChanged: false });
    fanout.publish({ conversationId: "c2", ownerId: "u1", messages: [message("m2", "c2")], ticketsChanged: false });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(summary(), ["message.created:c1:m1"]);
    releaseFirst();
    await fanout.idle();
    assert.deepEqual(summary(), ["message.created:c1:m1", "conversation.updated:c1:", "message.created:c2:m2", "conversation.updated:c2:"]);
  });

  it("com a leitura falhando, registra sem detalhes, publica as mensagens e segue para a próxima mudança", async (t) => {
    const logged = t.mock.method(console, "error", () => undefined);
    const { bus, summary } = recordingBus();
    const fanout = createFanout({
      bus,
      readConversation: (id) => (id === "c1" ? Promise.reject(new Error("banco fora: segredo")) : Promise.resolve(row(id))),
    });
    fanout.publish({ conversationId: "c1", ownerId: "u1", messages: [message("m1", "c1")], ticketsChanged: true });
    fanout.publish({ conversationId: "c2", ownerId: "u1", messages: [message("m2", "c2")], ticketsChanged: false });
    await fanout.idle();
    assert.deepEqual(summary(), ["message.created:c1:m1", "tickets.changed:c1:", "message.created:c2:m2", "conversation.updated:c2:"]);
    assert.equal(logged.mock.callCount(), 1);
    assert.doesNotMatch(JSON.stringify(logged.mock.calls[0]?.arguments), /segredo/);
  });

  it("tickets.changed da confirmação leva o código do chamado", async () => {
    const { bus, events } = recordingBus();
    const fanout = createFanout({ bus, readConversation: (id) => Promise.resolve(row(id)) });
    fanout.publish({ conversationId: "c1", ownerId: "u1", messages: [], ticketsChanged: true, ticketCode: "INC-7" });
    await fanout.idle();
    const last = events.at(-1);
    assert.deepEqual(last?.type === "tickets.changed" ? [last.conversationId, last.ticketCode] : null, ["c1", "INC-7"]);
  });

  it("publishTicketChange publica só tickets.changed, na mesma fila das conversas", async () => {
    const { bus, events, summary } = recordingBus();
    let release: () => void = () => undefined;
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fanout = createFanout({
      bus,
      readConversation: async (id) => {
        await slow;
        return row(id);
      },
    });
    fanout.publish({ conversationId: "c1", ownerId: "u1", messages: [message("m1")], ticketsChanged: false });
    fanout.publishTicketChange({ ownerId: "u2", ticketCode: "REQ-3", conversationId: null });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(summary(), ["message.created:c1:m1"]);
    release();
    await fanout.idle();
    assert.deepEqual(summary(), ["message.created:c1:m1", "conversation.updated:c1:", "tickets.changed:null:"]);
    const last = events.at(-1);
    assert.deepEqual(last?.type === "tickets.changed" ? [last.ownerId, last.ticketCode] : null, ["u2", "REQ-3"]);
  });

  it("publishTicketChange nunca lança para quem chama", () => {
    const fanout = createFanout({ bus: createEventBus(), readConversation: () => Promise.reject(new Error("x")) });
    assert.doesNotThrow(() => fanout.publishTicketChange({ ownerId: "u1", ticketCode: "INC-1", conversationId: "c1" }));
  });

  it("publish nunca lança para quem chama", () => {
    const fanout = createFanout({ bus: createEventBus(), readConversation: () => Promise.reject(new Error("x")) });
    assert.doesNotThrow(() => fanout.publish({ conversationId: "c1", ownerId: "u1", messages: [], ticketsChanged: false }));
  });
});
