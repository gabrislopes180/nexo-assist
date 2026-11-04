import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toTimelineMessage, type TimelineMessageRow } from "./timeline.js";

const trace = {
  understood: "Dúvida sobre VPN",
  intent: "QUESTION",
  actions: [{ tool: "searchHelpCenter", summary: "Central de ajuda: 1 artigo encontrado (VPN com erro 809).", status: "SUCCESS" }],
  confidence: "HIGH",
  reason: "Artigo cobre o caso",
};

function agentRow(rowTrace: unknown): TimelineMessageRow {
  return {
    id: "m1",
    conversationId: "c1",
    authorType: "AGENT",
    systemKind: null,
    content: "Reinstale o cliente de VPN.",
    createdAt: new Date("2026-11-01T12:00:00.000Z"),
    trace: rowTrace as TimelineMessageRow["trace"],
    author: null,
  };
}

describe("toTimelineMessage e a citação de artigo", () => {
  it("mantém trace.sources ao reler a mensagem (o card sobrevive ao reload)", () => {
    const sources = [{ kind: "ARTICLE", slug: "vpn-erro-809", title: "VPN com erro 809" }];
    assert.deepEqual(toTimelineMessage(agentRow({ ...trace, sources })).trace?.sources, sources);
  });

  it("trace antigo sem sources continua sendo lido", () => {
    const message = toTimelineMessage(agentRow(trace));
    assert.equal(message.trace?.intent, "QUESTION");
    assert.equal(message.trace?.sources, undefined);
  });
});
