import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONVERSATION_MESSAGE_LIMIT } from "../../conversations/conversation-rules.js";
import { closeSystemMessage, RETURN_SYSTEM_MESSAGE, takeoverSystemMessage } from "../../conversations/attendance.js";
import { HANDOFF_SYSTEM_MESSAGE } from "../../conversations/handoff.js";
import { agentTraceSchema } from "../../shared/transparency.js";
import { agentQuotaUsed, buildConversations, NEAR_LIMIT_CONVERSATION_ID } from "./conversations.js";

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

  it("toda SYSTEM tem o systemKind do seu texto, e só SYSTEM tem systemKind", () => {
    const kindOf = (content: string) =>
      content === HANDOFF_SYSTEM_MESSAGE
        ? "HANDOFF"
        : content === RETURN_SYSTEM_MESSAGE
          ? "RETURNED"
          : content.endsWith(" assumiu a conversa")
            ? "TAKEOVER"
            : content.endsWith(" encerrou o atendimento")
              ? "CLOSED"
              : "desconhecido";
    for (const conversation of conversations) {
      for (const m of conversation.messages) {
        assert.equal(m.systemKind, m.authorType === "SYSTEM" ? kindOf(m.content) : undefined, `${conversation.key}: ${m.content}`);
      }
    }
  });

  it("a cota conta só as mensagens do funcionário enviadas com a conversa no agent", () => {
    assert.equal(agentQuotaUsed(byId("seed-conv-returned").messages), 1);
    assert.equal(agentQuotaUsed(byId("seed-conv-closed-by-analyst").messages), 1);
    assert.equal(agentQuotaUsed(byId(NEAR_LIMIT_CONVERSATION_ID).messages), CONVERSATION_MESSAGE_LIMIT - 1);
    const withReturn = [
      { authorType: "EMPLOYEE", systemKind: null },
      { authorType: "SYSTEM", systemKind: "HANDOFF" },
      { authorType: "EMPLOYEE", systemKind: null },
      { authorType: "SYSTEM", systemKind: "RETURNED" },
      { authorType: "EMPLOYEE", systemKind: null },
    ] as const;
    assert.equal(agentQuotaUsed(withReturn), 2);
  });

  describe("atendimento por analista", () => {
    const at = (conversation: ReturnType<typeof byId>, authorType: string, content: string) =>
      conversation.messages.find((m) => m.authorType === authorType && m.content === content)?.at;

    it("C3: assignedAt é a hora da SYSTEM de quem assumiu", () => {
      const c3 = conversations.find((c) => c.key === "C3");
      assert.ok(c3?.assignedAt);
      assert.equal(c3.analystKey, "bruno");
      assert.deepEqual(at(c3, "SYSTEM", takeoverSystemMessage("Bruno Martins")), c3.assignedAt);
    });

    it("seed-conv-returned: da Ana, de volta com o agent, sem transferência nem analista", () => {
      const returned = byId("seed-conv-returned");
      assert.equal(returned.key, "C8");
      assert.equal(returned.ownerKey, "ana");
      assert.equal(returned.status, "WITH_AGENT");
      assert.equal(returned.analystKey, undefined);
      assert.equal(returned.handoffAt ?? returned.handoffReason ?? returned.handoffSummary, undefined);
      assert.ok(returned.returnedToAgentAt);
      assert.deepEqual(at(returned, "SYSTEM", RETURN_SYSTEM_MESSAGE), returned.returnedToAgentAt);
      assert.deepEqual(
        returned.messages.map((m) => [m.authorType, m.authorKey]),
        [
          ["EMPLOYEE", "ana"],
          ["AGENT", null],
          ["SYSTEM", null],
          ["SYSTEM", null],
          ["ANALYST", "bruno"],
          ["EMPLOYEE", "ana"],
          ["SYSTEM", null],
        ],
      );
      assert.ok(at(returned, "SYSTEM", HANDOFF_SYSTEM_MESSAGE));
      assert.ok(at(returned, "SYSTEM", takeoverSystemMessage("Bruno Martins")));
    });

    it("seed-conv-closed-by-analyst: da Juliana, encerrada pelo Rafael há 3 h, mantendo a transferência", () => {
      const closed = byId("seed-conv-closed-by-analyst");
      assert.equal(closed.key, "C9");
      assert.equal(closed.ownerKey, "juliana");
      assert.equal(closed.status, "CLOSED");
      assert.equal(closed.analystKey, "rafael");
      assert.equal(closed.handoffReason, "EMPLOYEE_REQUEST");
      assert.ok(closed.handoffSummary);
      assert.deepEqual(closed.closedAt, new Date(NOW.getTime() - 3 * 60 * 60 * 1000));
      assert.deepEqual(at(closed, "SYSTEM", closeSystemMessage("Rafael Lima")), closed.closedAt);
      assert.deepEqual(at(closed, "SYSTEM", takeoverSystemMessage("Rafael Lima")), closed.assignedAt);
      assert.deepEqual(at(closed, "SYSTEM", HANDOFF_SYSTEM_MESSAGE), closed.handoffAt);
      assert.equal(closed.messages.at(-1)?.content, closeSystemMessage("Rafael Lima"));
      assert.ok(closed.messages.some((m) => m.authorType === "ANALYST" && m.authorKey === "rafael"));
    });
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
