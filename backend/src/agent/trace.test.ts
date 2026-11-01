import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TicketLookupResult, TicketSummary } from "../shared/chat.js";
import { agentTraceSchema } from "../shared/transparency.js";
import type { DraftExecution } from "./tools/turn-recorder.js";
import { actionsFrom, citesOnlyKnownTickets, claimsFalseAction, composeReply, parseDecision, templateFor, type LlmDecision, type ReplyInput } from "./trace.js";

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

const compose = (input: Partial<ReplyInput>) => composeReply({ decision, fallbackText: "", executions: [], drafts: [], ...input });

describe("claimsFalseAction", () => {
  it("pega afirmações de ação feita", () => {
    for (const text of [
      "Complementei o chamado.",
      "Adicionei a informação ao INC-1.",
      "Incluí isso no chamado.",
      "Registrei o seu pedido.",
      "Atualizei o chamado.",
      "Já atualizei tudo.",
      "Pronto, acrescentei ao chamado.",
      "O complemento foi registrado.",
      "Seu complemento já está salvo.",
      "Confirma o complemento?",
      "Confira e confirme.",
      "Preparei o complemento do chamado.",
    ]) {
      assert.equal(claimsFalseAction(text), true, text);
    }
  });

  it("não acusa frase negativa", () => {
    for (const text of ["Não atualizei o chamado.", "Ainda não registrei nada.", "Nada foi alterado: não adicionei o complemento.", "Eu nunca incluí isso."]) {
      assert.equal(claimsFalseAction(text), false, text);
    }
  });

  it("uma negação não protege outra frase", () => {
    assert.equal(claimsFalseAction("Não atualizei o título, mas adicionei o complemento."), true);
    assert.equal(claimsFalseAction("Não mudei nada. Registrei o pedido."), true);
  });

  it("não acusa orientação nem dado do chamado", () => {
    for (const text of ["Para confirmar, use o botão Confirmar.", "Quer que eu prepare o complemento?", "O chamado foi registrado em 28/10.", "Inclui o notebook da filial.", "O INC-1 está em atendimento."]) {
      assert.equal(claimsFalseAction(text), false, text);
    }
  });
});

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

  describe("complemento", () => {
    const proposal = { kind: "COMPLEMENT" as const, ticket: ticket("INC-20311"), content: "Ele desliga sozinho." };
    const drafted: DraftExecution = { outcome: "DRAFTED", proposal };
    const notAvailable: DraftExecution = { outcome: "TICKET_NOT_AVAILABLE" };
    const serviceDown: DraftExecution = { outcome: "SERVICE_UNAVAILABLE" };

    it("com proposta, o texto é sempre o template com o código real", () => {
      const reply = compose({ decision: { ...decision, content: "Adicionei ao INC-999!" }, drafts: [drafted] });
      assert.equal(reply?.content, "Preparei o complemento do INC-20311. Confira e confirme.");
      assert.equal(reply?.ticketDraft, proposal);
      assert.equal(reply?.trace.intent, "COMPLEMENT");
    });

    it("registra draftComplement na ação do turno, nunca addTicketComplement", () => {
      const reply = compose({ executions: [single], drafts: [drafted] });
      assert.deepEqual(reply?.trace.actions.map((action) => action.tool), ["searchMyOpenTickets", "draftComplement"]);
    });

    it("com proposta, aproveita o turno mesmo sem texto do modelo", () => {
      assert.equal(compose({ decision: null, fallbackText: "", drafts: [drafted] })?.ticketDraft, proposal);
    });

    it("vale a última proposta aceita", () => {
      const other = { ...proposal, ticket: ticket("REQ-2") };
      const reply = compose({ drafts: [drafted, { outcome: "DRAFTED", proposal: other }] });
      assert.equal(reply?.ticketDraft, other);
      assert.match(reply?.content ?? "", /REQ-2/);
    });

    it("chamado indisponível: sem rascunho, template que não afirma se existe", () => {
      const reply = compose({ decision: { ...decision, content: "Esse chamado é da Juliana, confirma?" }, drafts: [notAvailable] });
      assert.equal(reply?.ticketDraft, null);
      assert.match(reply?.content ?? "", /não está entre os seus chamados abertos/);
      assert.ok(!/juliana|resolvido|existe/i.test(reply?.content ?? ""));
      assert.equal(reply?.trace.actions[0]?.status, "SKIPPED");
      assert.equal(reply?.trace.confidence, "LOW");
    });

    it("serviço indisponível: sem rascunho e ação ERROR", () => {
      const reply = compose({ drafts: [serviceDown] });
      assert.equal(reply?.ticketDraft, null);
      assert.match(reply?.content ?? "", /indisponível/);
      assert.equal(reply?.trace.actions[0]?.status, "ERROR");
    });

    it("falsa ação sem proposta vira template, sem rascunho", () => {
      const reply = compose({ decision: { ...decision, content: "Complementei o chamado.", understood: "Quer complementar" } });
      assert.equal(reply?.ticketDraft, null);
      assert.match(reply?.content ?? "", /nada foi alterado/i);
      assert.equal(reply?.trace.confidence, "LOW");
    });

    it("pedir confirmação sem proposta vira template", () => {
      assert.match(compose({ decision: { ...decision, content: "Confirma o complemento?" } })?.content ?? "", /nada foi alterado/i);
    });

    it("frase negativa passa pela guarda", () => {
      assert.equal(compose({ decision: { ...decision, content: "Não atualizei o chamado." } })?.content, "Não atualizei o chamado.");
    });

    it("falsa ação no texto puro também é barrada", () => {
      assert.match(compose({ decision: null, fallbackText: "Registrei o complemento." })?.content ?? "", /nada foi alterado/i);
    });

    it("fora de escopo descarta a proposta e não diz que preparou nada", () => {
      const reply = compose({ decision: { ...decision, content: "Só ajudo com suporte.", intent: "OUT_OF_SCOPE" }, drafts: [drafted] });
      assert.equal(reply?.ticketDraft, null);
      assert.equal(reply?.content, "Só ajudo com suporte.");
      assert.equal(reply?.trace.intent, "OUT_OF_SCOPE");
    });

    it("fora de escopo com falsa ação cai no template de escopo", () => {
      const reply = compose({ decision: { ...decision, content: "Registrei isso.", intent: "OUT_OF_SCOPE" } });
      assert.match(reply?.content ?? "", /suporte/);
      assert.ok(!/nada foi alterado/i.test(reply?.content ?? ""));
    });

    it("sem proposta, a citação continua valendo", () => {
      const reply = compose({ decision: { ...decision, content: "O INC-999 está aberto." } });
      assert.equal(reply?.content, templateFor(null));
    });
  });

  describe("intent OUT_OF_SCOPE com tool executada", () => {
    const outOfScope: LlmDecision = { ...decision, content: "Só ajudo com suporte de TI e chamados.", intent: "OUT_OF_SCOPE" };

    it("devolve ticketLookup null e mantém a ação no trace", () => {
      const reply = compose({ decision: outOfScope, executions: [multiple] });
      assert.equal(reply?.ticketLookup, null);
      assert.equal(reply?.content, outOfScope.content);
      assert.equal(reply?.trace.intent, "OUT_OF_SCOPE");
      assert.deepEqual(reply?.trace.actions, actionsFrom([multiple]));
    });

    it("não troca a resposta pelo template da consulta", () => {
      for (const execution of [noMatch, noOpen, unavailable]) {
        assert.equal(compose({ decision: outOfScope, executions: [execution] })?.content, outOfScope.content);
      }
    });

    it("recusa chamado citado, sem expor a lista", () => {
      const reply = compose({ decision: { ...outOfScope, content: "Não sei, mas o INC-1 segue aberto." }, executions: [multiple] });
      assert.equal(reply?.ticketLookup, null);
      assert.equal(citesOnlyKnownTickets(reply?.content ?? "", null), true);
      assert.match(reply?.content ?? "", /suporte/);
      assert.equal(reply?.trace.confidence, "LOW");
    });
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
