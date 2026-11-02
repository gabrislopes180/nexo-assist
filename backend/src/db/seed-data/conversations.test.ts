import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONVERSATION_MESSAGE_LIMIT } from "../../conversations/conversation-rules.js";
import { HANDOFF_SYSTEM_MESSAGE } from "../../conversations/handoff.js";
import { agentTraceSchema } from "../../shared/transparency.js";
import { buildConversations, NEAR_LIMIT_CONVERSATION_ID } from "./conversations.js";

const NOW = new Date("2026-11-01T12:00:00.000Z");
const conversations = buildConversations(NOW, () => NOW);

function byId(id: string) {
  const conversation = conversations.find((c) => c.id === id);
  assert.ok(conversation, `conversa ${id} ausente`);
  return conversation;
}

describe("conversas do seed", () => {
  it("tem ids fixos para os cenários de demonstração", () => {
    assert.equal(byId("seed-conv-closed").status, "CLOSED");
    assert.equal(byId("seed-conv-closed").ownerKey, "marina");
    assert.equal(byId("seed-conv-waiting").status, "WAITING_ANALYST");
    assert.equal(byId("seed-conv-waiting").ownerKey, "juliana");
  });

  it("tem uma conversa aguardando analista para cada motivo do console", () => {
    for (const reason of ["EMPLOYEE_REQUEST", "LOW_CONFIDENCE", "CRITICAL", "OVERDUE"] as const) {
      const waiting = conversations.filter((c) => c.status === "WAITING_ANALYST" && c.handoffReason === reason);
      assert.ok(waiting.length >= 1, reason);
      for (const conversation of waiting) {
        assert.ok(conversation.handoffSummary && conversation.handoffSummary.length <= 1000, `${reason}: resumo`);
        assert.ok(conversation.handoffAt, `${reason}: handoffAt`);
        assert.equal(conversation.analystKey, undefined, `${reason}: sem analista`);
      }
    }
  });

  it("tem conversas WITH_AGENT e CLOSED, com donos variados", () => {
    assert.ok(conversations.some((c) => c.status === "WITH_AGENT"));
    assert.ok(conversations.some((c) => c.status === "CLOSED"));
    const waitingOwners = new Set(conversations.filter((c) => c.status === "WAITING_ANALYST").map((c) => c.ownerKey));
    assert.ok(waitingOwners.size >= 3);
  });

  it("toda transferência nova tem a mensagem SYSTEM depois da resposta do agent", () => {
    for (const conversation of conversations.filter((c) => c.handoffAt !== undefined)) {
      const index = conversation.messages.findIndex(
        (m) => m.authorType === "SYSTEM" && m.content === HANDOFF_SYSTEM_MESSAGE && m.at.getTime() === conversation.handoffAt?.getTime(),
      );
      assert.ok(index > 0, conversation.key);
      assert.equal(conversation.messages[index - 1]?.authorType, "AGENT", conversation.key);
    }
  });

  it("mensagens em ordem cronológica estrita em todas as conversas", () => {
    for (const conversation of conversations) {
      conversation.messages.forEach((message, index) => {
        const previous = conversation.messages[index - 1];
        if (previous) assert.ok(previous.at < message.at, `${conversation.key} #${index}`);
      });
    }
  });

  describe("conversa perto do limite", () => {
    const { ownerKey, status, messages } = byId(NEAR_LIMIT_CONVERSATION_ID);

    it("é da Marina, com o agent, a uma mensagem do limite", () => {
      assert.equal(NEAR_LIMIT_CONVERSATION_ID, "seed-conv-near-limit");
      assert.equal(ownerKey, "marina");
      assert.equal(status, "WITH_AGENT");
      assert.equal(messages.filter((m) => m.authorType === "EMPLOYEE").length, CONVERSATION_MESSAGE_LIMIT - 1);
    });

    it("alterna funcionário e agent, terminando no agent", () => {
      assert.equal(messages.length, 58);
      messages.forEach((message, index) => {
        assert.equal(message.authorType, index % 2 === 0 ? "EMPLOYEE" : "AGENT");
        assert.equal(message.authorKey, index % 2 === 0 ? "marina" : null);
      });
    });

    it("tem trace válido em toda resposta do agent", () => {
      for (const message of messages.filter((m) => m.authorType === "AGENT")) {
        assert.equal(agentTraceSchema.safeParse(message.trace).success, true);
      }
    });

    it("está em ordem cronológica, no passado", () => {
      messages.forEach((message, index) => {
        const previous = messages[index - 1];
        if (previous) assert.ok(previous.at < message.at);
        assert.ok(message.at < NOW);
      });
    });
  });
});
