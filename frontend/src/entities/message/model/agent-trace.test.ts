import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildConsoleTimeline } from "../lib/console-timeline";
import { trailSteps } from "../lib/trail-steps";
import { AgentDecision } from "../ui/agent-decision";
import { AgentMessage } from "../ui/agent-message";
import { ConsoleMessage } from "../ui/console-message";
import { agentMessageSchema, agentTraceSchema, type AgentTrace } from "./message";
import { messageCreatedEventSchema } from "./message-events";
import { timelineMessageSchema } from "./timeline-message";

const at = "2026-11-04T13:00:00.000Z";
const trace: AgentTrace = {
  understood: "Você quer abrir um chamado sobre a VPN.",
  intent: "OPEN_TICKET",
  actions: [
    { tool: "draftTicket", summary: "Preparou um rascunho; o chamado ainda não foi criado.", status: "SUCCESS" },
    { tool: "createTicket", summary: "Criação aguardando confirmação.", status: "SKIPPED" },
    { tool: "searchHelpCenter", summary: "A central de ajuda não respondeu.", status: "ERROR" },
  ],
  confidence: "MEDIUM",
  reason: "O problema afeta apenas você; a abertura depende da sua confirmação.",
};
const message = {
  id: "m1", authorType: "AGENT", author: null, systemKind: null,
  content: "Confira o rascunho.", createdAt: at, trace,
};

describe("transparência por mensagem", () => {
  it("POST, histórico e SSE preservam os mesmos campos da decisão", () => {
    expect(agentMessageSchema.parse(message).trace).toEqual(trace);
    expect(timelineMessageSchema.parse(message).trace).toEqual(trace);
    expect(messageCreatedEventSchema.parse({ conversationId: "c1", message }).message.trace).toEqual(trace);
  });

  it("aceita explicações parciais, sem inventar confiança ou campos antigos", () => {
    const partial = agentTraceSchema.parse({ actions: [], reason: "Motivo disponível", confidence: 0.9, understood: " ", intent: "desconhecido" });
    expect(partial.reason).toBe("Motivo disponível");
    expect(partial.confidence).toBeUndefined();
    expect(partial.understood).toBeUndefined();
    expect(partial.intent).toBeUndefined();
    const html = renderToStaticMarkup(createElement(AgentDecision, { trace: partial }));
    expect(html).toContain("Motivo disponível");
    expect(html).not.toContain("Grau de segurança");
    expect(html).not.toContain("O que entendi");
  });

  it.each([undefined, null, { actions: [] }])("omite o detalhe sem dados disponíveis (%j)", (legacy) => {
    expect(renderToStaticMarkup(createElement(AgentDecision, { trace: legacy }))).toBe("");
    expect(agentMessageSchema.parse({ ...message, trace: legacy }).content).toBe(message.content);
  });

  it("mantém a explicação associada à mensagem correta no console", () => {
    const second = { ...trace, understood: "Outro pedido", reason: "Outro motivo" };
    const timeline = buildConsoleTimeline([
      timelineMessageSchema.parse(message),
      timelineMessageSchema.parse({ ...message, id: "m2", trace: second }),
      timelineMessageSchema.parse({ ...message, id: "e1", authorType: "EMPLOYEE", trace }),
    ], { ownerName: "Marina", now: new Date(at) });
    const messages = timeline.filter((item) => item.kind === "message");
    expect(messages.map((item) => [item.key, item.trace])).toEqual([
      ["m1", trace], ["m2", second], ["e1", null],
    ]);
  });

  it("chat e console exibem os mesmos dados e diferenciam sucesso, falha e ação não realizada", () => {
    const timeline = buildConsoleTimeline([timelineMessageSchema.parse(message)], { ownerName: "Marina", now: new Date(at) });
    const item = timeline.find((entry) => entry.kind === "message");
    if (!item || item.kind !== "message") throw new Error("Mensagem do console ausente");
    const views = [
      AgentMessage({ steps: trailSteps(trace.actions), trace, children: message.content }),
      createElement(ConsoleMessage, { message: item }),
    ];
    for (const view of views) {
      const html = renderToStaticMarkup(view);
      expect(html).toContain("<details");
      expect(html).not.toContain("<details open");
      expect(html).toContain("Como decidi</summary>");
      expect(html).toContain(trace.understood);
      expect(html).toContain(trace.reason);
      expect(html).toContain("Média");
      expect(html).toContain("Realizada: ");
      expect(html).toContain("Não realizada: ");
      expect(html).toContain("Falhou: ");
      expect(html).toContain("o chamado ainda não foi criado.");
      expect(html.indexOf("montou o rascunho")).toBeLessThan(html.indexOf(message.content));
    }
  });

  it("exibe a explicação como texto, sem interpretar HTML recebido", () => {
    const html = renderToStaticMarkup(createElement(AgentDecision, { trace: { actions: [], reason: '<script>alert("x")</script>' } }));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
