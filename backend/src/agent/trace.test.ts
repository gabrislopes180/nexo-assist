import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TicketLookupResult, TicketSummary } from "../shared/chat.js";
import { agentTraceSchema } from "../shared/transparency.js";
import { actionsFrom, citesOnlyKnownTickets, composeReply, parseDecision, templateFor, type LlmDecision, type ReplyInput } from "./trace.js";

const ticket = (code: string, overrides: Partial<TicketSummary> = {}): TicketSummary => ({
  code,
  type: "INC",
  category: "HARDWARE",
  priority: "HIGH",
  status: "IN_PROGRESS",
  statusLabel: "Em atendimento",
  title: "Notebook lento",
  createdAt: "2026-10-28T12:00:00.000Z",
  dueAt: "2026-10-30T12:00:00.000Z",
  overdue: false,
  ...overrides,
});

const single: TicketLookupResult = {
  outcome: "SINGLE_MATCH",
  openTicketCount: 3,
  totalMatches: 1,
  tickets: [ticket("INC-20311", { overdue: true })],
};
const multiple: TicketLookupResult = { outcome: "MULTIPLE_MATCHES", openTicketCount: 3, totalMatches: 2, tickets: [ticket("INC-1"), ticket("REQ-2")] };
const noMatch: TicketLookupResult = { outcome: "NO_MATCH", openTicketCount: 3, totalMatches: 0, tickets: [] };
const noOpen: TicketLookupResult = { outcome: "NO_OPEN_TICKETS", openTicketCount: 0, totalMatches: 0, tickets: [] };
const unavailable: TicketLookupResult = { outcome: "UNAVAILABLE", openTicketCount: null, totalMatches: null, tickets: [] };

const decision: LlmDecision = {
  content: "O chamado INC-20311 está em atendimento.",
  understood: "Quer o status",
  intent: "CHECK_TICKET",
  confidence: "HIGH",
  reason: "Citou o código",
};

const compose = (input: Partial<ReplyInput>) => composeReply({ decision, fallbackText: "", executions: [], ...input });

describe("citesOnlyKnownTickets", () => {
  it("aceita texto sem código, com ou sem consulta", () => {
    assert.equal(citesOnlyKnownTickets("Paris é a capital.", null), true);
  });

  it("aceita código devolvido pelo serviço, sem diferenciar caixa", () => {
    assert.equal(citesOnlyKnownTickets("Veja o inc-20311.", single), true);
  });

  it("recusa código que o serviço não devolveu", () => {
    assert.equal(citesOnlyKnownTickets("INC-20311 e REQ-999", single), false);
  });

  it("recusa código citado sem consulta nenhuma", () => {
    assert.equal(citesOnlyKnownTickets("Seu chamado INC-1 está aberto.", null), false);
  });
});

describe("templateFor", () => {
  it("cita código, status e atraso em SINGLE_MATCH", () => {
    const text = templateFor(single);
    assert.match(text, /INC-20311/);
    assert.match(text, /Em atendimento/);
    assert.match(text, /vencid/i);
  });

  it("avisa quando a lista foi cortada", () => {
    const tickets = ["INC-1", "INC-2", "INC-3", "INC-4", "INC-5"].map((code) => ticket(code));
    assert.match(templateFor({ outcome: "MULTIPLE_MATCHES", openTicketCount: 7, totalMatches: 7, tickets }), /5 mais urgentes/);
  });

  it("lista os códigos em MULTIPLE_MATCHES", () => {
    assert.match(templateFor(multiple), /INC-1.*REQ-2/s);
  });

  it("diz nenhum chamado aberto em NO_MATCH e NO_OPEN_TICKETS", () => {
    assert.match(templateFor(noMatch), /nenhum chamado aberto/i);
    assert.match(templateFor(noOpen), /nenhum chamado aberto/i);
  });

  it("nunca cita chamado em UNAVAILABLE e sem consulta", () => {
    assert.equal(citesOnlyKnownTickets(templateFor(unavailable), null), true);
    assert.equal(citesOnlyKnownTickets(templateFor(null), null), true);
  });
});

describe("actionsFrom", () => {
  it("cria uma ação por execução real, com ERROR em UNAVAILABLE", () => {
    const actions = actionsFrom([single, unavailable]);
    assert.deepEqual(
      actions.map((action) => [action.tool, action.status]),
      [
        ["searchMyOpenTickets", "SUCCESS"],
        ["searchMyOpenTickets", "ERROR"],
      ],
    );
  });

  it("fica vazio sem execução", () => {
    assert.deepEqual(actionsFrom([]), []);
  });
});

describe("parseDecision", () => {
  it("aproveita o objeto validado", () => {
    assert.deepEqual(parseDecision(decision, ""), decision);
  });

  it("mantém content e descarta só o campo inválido", () => {
    const parsed = parseDecision({ content: "Olá.", intent: "INVENTADO" }, "");
    assert.equal(parsed?.content, "Olá.");
    assert.equal(parsed?.intent, undefined);
  });

  it("lê o JSON do texto quando o objeto não veio, mesmo em bloco de código", () => {
    assert.equal(parseDecision(undefined, ["```json", '{"content":"Olá."}', "```"].join("\n"))?.content, "Olá.");
  });

  it("devolve null sem content aproveitável", () => {
    assert.equal(parseDecision(undefined, "texto livre"), null);
    assert.equal(parseDecision({ intent: "OTHER" }, ""), null);
  });
});

describe("composeReply", () => {
  it("usa os campos da LLM quando a citação confere", () => {
    const reply = compose({ executions: [single] });
    assert.equal(reply?.content, decision.content);
    assert.equal(reply?.trace.confidence, "HIGH");
    assert.equal(reply?.ticketLookup, single);
    assert.equal(agentTraceSchema.safeParse(reply?.trace).success, true);
  });

  it("devolve ticketLookup null sem execução", () => {
    const reply = compose({ decision: { ...decision, content: "Só falo de suporte." } });
    assert.equal(reply?.ticketLookup, null);
    assert.deepEqual(reply?.trace.actions, []);
  });

  it("vale a última execução do turno", () => {
    assert.equal(compose({ executions: [noMatch, single] })?.ticketLookup, single);
  });

  it("troca por template quando a LLM inventa chamado e baixa a confiança", () => {
    const reply = compose({ decision: { ...decision, content: "O chamado INC-999 está pronto." }, executions: [noMatch] });
    assert.equal(reply?.content, templateFor(noMatch));
    assert.equal(reply?.trace.confidence, "LOW");
    assert.match(reply?.trace.reason ?? "", /não retornado/);
  });

  it("troca por template quando cita chamado sem chamar a tool", () => {
    const reply = compose({ decision: { ...decision, content: "O INC-20311 está em atendimento." } });
    assert.equal(reply?.content, templateFor(null));
    assert.equal(reply?.ticketLookup, null);
    assert.equal(reply?.trace.confidence, "LOW");
  });

  it("não guarda o que a LLM entendeu quando a guarda dispara", () => {
    const reply = compose({ decision: { ...decision, content: "O INC-999 foi resolvido.", understood: "Quer o INC-999" }, executions: [noMatch] });
    assert.ok(!reply?.trace.understood.includes("INC-999"));
  });

  it("em NO_MATCH exige dizer nenhum chamado aberto", () => {
    const reply = compose({ decision: { ...decision, content: "Esse chamado não existe." }, executions: [noMatch] });
    assert.equal(reply?.content, templateFor(noMatch));
    assert.equal(reply?.trace.confidence, "LOW");
    assert.equal(compose({ decision: null, fallbackText: "Esse chamado não existe.", executions: [noMatch] })?.content, templateFor(noMatch));
  });

  it("em NO_OPEN_TICKETS exige dizer nenhum chamado aberto", () => {
    assert.equal(compose({ decision: { ...decision, content: "Está tudo certo." }, executions: [noOpen] })?.content, templateFor(noOpen));
  });

  it("decisão parcial preenche o trace com fallback campo a campo", () => {
    const reply = compose({ decision: { content: "Olá." } });
    assert.equal(reply?.content, "Olá.");
    assert.equal(reply?.trace.intent, "OTHER");
    assert.equal(reply?.trace.confidence, "LOW");
    assert.equal(agentTraceSchema.safeParse(reply?.trace).success, true);
  });

  it("texto vazio após a tool não produz resposta", () => {
    assert.equal(compose({ decision: null, fallbackText: "", executions: [single] }), null);
    assert.equal(compose({ decision: null, fallbackText: "", executions: [unavailable] }), null);
  });

  it("em UNAVAILABLE ignora o texto da LLM", () => {
    const reply = compose({ decision: { ...decision, content: "Seu chamado segue em andamento." }, executions: [unavailable] });
    assert.equal(reply?.content, templateFor(unavailable));
    assert.equal(reply?.trace.actions[0]?.status, "ERROR");
  });

  it("sem decisão válida usa o texto puro com fallback determinístico no trace", () => {
    const reply = compose({ decision: null, fallbackText: "Texto livre do modelo." });
    assert.equal(reply?.content, "Texto livre do modelo.");
    assert.equal(reply?.trace.confidence, "LOW");
    assert.equal(reply?.trace.intent, "OTHER");
    assert.equal(agentTraceSchema.safeParse(reply?.trace).success, true);
  });

  it("sem decisão, com consulta, usa template e intent CHECK_TICKET", () => {
    const reply = compose({ decision: null, fallbackText: '{"content": "trunc', executions: [single] });
    assert.equal(reply?.content, templateFor(single));
    assert.equal(reply?.trace.intent, "CHECK_TICKET");
  });

  it("sem decisão, sem consulta e com JSON quebrado não produz resposta", () => {
    assert.equal(compose({ decision: null, fallbackText: '```json\n{"content"' }), null);
    assert.equal(compose({ decision: null, fallbackText: "   " }), null);
  });

  it("não aceita decisão com conteúdo vazio", () => {
    assert.equal(compose({ decision: { ...decision, content: "   " } }), null);
  });
});
