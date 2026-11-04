import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildConversations } from "./conversations.js";
import { buildTickets, ticketActorProblems } from "./tickets.js";
import { USERS } from "./users.js";

const NOW = new Date("2026-11-01T12:00:00.000Z");
const tickets = buildTickets(NOW);

describe("chamados do seed", () => {
  it("cada evento tem o ator certo: ANALYST com papel de analista, EMPLOYEE é o dono, AGENT e SYSTEM sem ator", () => {
    assert.deepEqual(ticketActorProblems(tickets, USERS), []);
  });

  it("a checagem acusa analista que não é analista e funcionário que não é o dono", () => {
    const [first] = tickets;
    assert.ok(first);
    const broken = [
      {
        ...first,
        events: [
          ...first.events,
          { at: NOW, type: "STATUS_CHANGED" as const, actorType: "ANALYST" as const, actorKey: "ana" as const, toStatus: "IN_PROGRESS" as const },
          { at: NOW, type: "COMMENT" as const, actorType: "EMPLOYEE" as const, actorKey: "juliana" as const, content: "x" },
          { at: NOW, type: "TRANSFERRED" as const, actorType: "AGENT" as const, actorKey: "bruno" as const },
        ],
      },
    ];
    assert.equal(ticketActorProblems(broken, USERS).length, 3);
  });

  it("tem um chamado aguardando analista ligado a uma conversa já assumida por um analista", () => {
    const withAnalyst = new Set(buildConversations(NOW, () => NOW).filter((c) => c.status === "WITH_ANALYST").map((c) => c.key));
    const demo = tickets.filter((t) => {
      // Sem STATUS_CHANGED nem REOPENED, o chamado continua em WAITING_ANALYST desde a criação.
      const waiting = t.events.every((e) => e.type !== "STATUS_CHANGED" && e.type !== "REOPENED");
      return waiting && t.events.some((e) => e.conversationKey !== undefined && withAnalyst.has(e.conversationKey));
    });
    assert.deepEqual(demo.map((t) => t.code), ["INC-20405"]);
  });
});
