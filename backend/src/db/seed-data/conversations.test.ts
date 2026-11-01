import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONVERSATION_MESSAGE_LIMIT } from "../../conversations/conversation-rules.js";
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
