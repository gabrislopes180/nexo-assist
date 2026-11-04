import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TicketLookupResult, TicketSummary } from "../shared/chat.js";
import { agentTraceSchema } from "../shared/transparency.js";
import type { DraftExecution } from "./tools/turn-recorder.js";
import { articleNote, citedArticleIn, HELP_QUICK_REPLIES, llmDecisionSchema, triedArticleFrom } from "./trace.js";
import { knownCodesFrom, overdueOfferCodeFrom, overdueOfferText, relatedCodeFrom, windowExpiredText } from "./trace.js";
import { actionsFrom, CONFIRMATION_REPLY, citesOnlyKnownTickets, claimsFalseAction, isBareConfirmation, composeReply, OUT_OF_SCOPE_REPLY, parseDecision, templateFor, WAITING_EMPLOYEE_NOTE, type LlmDecision, type ReplyInput } from "./trace.js";
import { redirectReply } from "../knowledge/redirect-targets.js";

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

const compose = (input: Partial<ReplyInput>) => composeReply({ message: "", decision, fallbackText: "", executions: [], drafts: [], ...input });

describe("isBareConfirmation", () => {
  it("reconhece confirmação curta", () => {
    for (const message of [
      "confirmo",
      "Confirmo.",
      "CONFIRMO!",
      "pode confirmar",
      "Pode confirmar, por favor",
      "ok, confirma",
      "Ok confirmado",
      "sim, confirmo",
      "confirmo o complemento",
      "confirmo sim",
      "já confirmei",
      "Já confirmei, pode gravar",
    ]) {
      assert.equal(isBareConfirmation(message), true, message);
    }
  });

  it("não confunde frase com conteúdo", () => {
    for (const message of [
      "confirmo que o problema continua no INC-20311",
      "Confirmo que ele desliga sozinho",
      "o chamado confirma o erro",
      "não confirmo",
      "posso confirmar?",
      "como eu confirmo?",
      "confirmo o INC-20311",
      "Quero acrescentar no INC-20311 que confirmo o defeito",
    ]) {
      assert.equal(isBareConfirmation(message), false, message);
    }
  });

  it("exige uma palavra de confirmação", () => {
    for (const message of ["ok", "sim", "pode", "por favor", "", "   "]) {
      assert.equal(isBareConfirmation(message), false, message);
    }
  });
});

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
      "Criei o chamado.",
      "Abri um chamado para você.",
      "Registrei o chamado.",
      "Seu chamado foi criado.",
      "Seu chamado foi aberto.",
      "Chamado registrado com sucesso.",
      "Pronto, está registrado.",
      "Encaminhei para a equipe.",
      "Enviei o pedido ao suporte.",
      "Não se preocupe que já criei o chamado.",
      "Posso criar o chamado?",
      "Confirma?",
      "Reabri o chamado.",
      "O chamado foi reaberto.",
      "Chamado reaberto com sucesso.",
      "Pronto, o INC-12 foi reaberto.",
      "O INC-12 já foi reaberto",
      "Transferi você para um analista.",
      "Chamei um analista para você.",
      "A conversa foi transferida.",
      "Transferido!",
      "Você foi transferido para um analista.",
      "O analista já foi acionado.",
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
    for (const text of ["Para confirmar, use o botão Confirmar.", "Quer que eu prepare o complemento?", "O chamado foi registrado em 28/10.", "O chamado foi criado em 28/10.", "Seu chamado está aberto e aguardando analista.", "Confirme o código do chamado, por favor.", "Você confirma que o erro é 809?", "Não, eu não criei nada.", "Não o atualizei.", "O chamado foi reaberto em 30/10.", "Não reabri nada.", "Seu chamado foi aberto há 3 dias.", "O chamado foi reaberto pela analista ontem.", "Seu chamado reaberto INC-12 está em andamento.", "Quer que eu chame um analista?", "Não transferi a conversa.", "Seu INC-7 foi transferido para a fila de Redes.", "A licença foi transferida para o novo notebook.", "Abri o notebook e nada.", "Quer abrir um chamado?", "Inclui o notebook da filial.", "O INC-1 está em atendimento."]) {
      assert.equal(claimsFalseAction(text), false, text);
    }
  });
});

describe("overdueOfferCodeFrom", () => {
  it("lê o código da oferta na última resposta", () => {
    assert.equal(overdueOfferCodeFrom(["Antes.", `O INC-20311 está atrasado. ${overdueOfferText("INC-20311", true)}`]), "INC-20311");
    assert.equal(overdueOfferCodeFrom([`Status ok. ${overdueOfferText("INC-20311")}`]), "INC-20311");
  });

  it("ignora oferta antiga, sem código ou com mais de um código", () => {
    assert.equal(overdueOfferCodeFrom([overdueOfferText("INC-1"), "Outra resposta."]), null);
    assert.equal(overdueOfferCodeFrom(["Quer que eu chame um analista?"]), null);
    assert.equal(overdueOfferCodeFrom(["INC-1 e INC-2. Quer que eu chame um analista?"]), null);
  });
});

describe("knownCodesFrom", () => {
  it("conta códigos que o agent trouxe e ignora os que só repetiu do usuário", () => {
    const history = [
      { authorType: "EMPLOYEE", content: "E o INC-99999?" },
      { authorType: "AGENT", content: "Não encontrei o INC-99999. Seus chamados: INC-20311." },
      { authorType: "EMPLOYEE", content: "Ok, e o INC-20311?" },
      { authorType: "AGENT", content: "O INC-20311 está em atendimento." },
    ];
    assert.deepEqual(knownCodesFrom(history), ["INC-20311"]);
  });

  it("conta códigos que o analista trouxe, com a mesma regra do agent", () => {
    const history = [
      { authorType: "EMPLOYEE", content: "Minha impressora não imprime, é o INC-1?" },
      { authorType: "ANALYST", content: "Não é o INC-1: abri o INC-30500 para trocar o toner." },
    ];
    assert.deepEqual(knownCodesFrom(history), ["INC-30500"]);
  });
});

describe("relatedCodeFrom", () => {
  it("vale logo depois do aviso de fora da janela", () => {
    assert.equal(relatedCodeFrom([windowExpiredText("INC-1")]), "INC-1");
  });

  it("sobrevive à pergunta de afetados e ao aviso de parecido", () => {
    assert.equal(relatedCodeFrom([windowExpiredText("INC-1"), "Quem está sendo afetado?"]), "INC-1");
    assert.equal(relatedCodeFrom([windowExpiredText("INC-1"), "Já existe chamado aberto parecido: INC-2 (x, y). Quer complementar o aberto ou abrir um novo?"]), "INC-1");
  });

  it("some quando a conversa seguiu para outra resposta", () => {
    assert.equal(relatedCodeFrom([windowExpiredText("INC-1"), "Tudo bem.", "Quem está sendo afetado?"]), null);
  });

  it("some depois de uma proposta de criação", () => {
    assert.equal(relatedCodeFrom([windowExpiredText("INC-1"), "Coloquei prioridade Média. Confira antes de eu criar:"]), null);
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

  it("transferência recusada por conversa devolvida explica a política", () => {
    const [action] = actionsFrom([], [], [{ outcome: "REJECTED", problem: "RETURNED_BY_ANALYST" }]);
    assert.deepEqual(action, {
      tool: "transferToAnalyst",
      summary: "Conversa devolvida por um analista: só um pedido explícito transfere; a conversa continua com o agent.",
      status: "SKIPPED",
    });
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
    assert.ok(reply?.content.startsWith(decision.content));
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

  it("remove o prefixo [Analista] copiado pelo modelo", () => {
    for (const content of ["[Analista] De nada!", "  [analista]: De nada!", "[ Analista ]De nada!", "[Analista] [Analista] De nada!"]) {
      assert.equal(compose({ decision: { ...decision, content, intent: "OTHER" } })?.content, "De nada!", content);
    }
    assert.equal(compose({ decision: null, fallbackText: "[Analista] De nada!" })?.content, "De nada!");
    assert.equal(compose({ decision: { ...decision, content: "Como o [Analista] disse, reinicie.", intent: "OTHER" } })?.content, "Como o [Analista] disse, reinicie.");
  });

  it("só o prefixo [Analista], sem texto, não produz resposta", () => {
    assert.equal(compose({ decision: { ...decision, content: "[Analista]", intent: "OTHER" } }), null);
  });

  it("texto vazio após a tool não produz resposta", () => {
    assert.equal(compose({ decision: null, fallbackText: "", executions: [single] }), null);
    assert.equal(compose({ decision: null, fallbackText: "", executions: [unavailable] }), null);
  });

  describe("mensagem que é só confirmação", () => {
    const proposal = { kind: "COMPLEMENT" as const, ticket: ticket("INC-20311"), content: "Texto." };

    it("não assume o tipo de rascunho na intenção", () => {
      assert.equal(compose({ message: "Confirmo" })?.trace.intent, "OTHER");
    });

    it("devolve o template, sem lookup, e mantém a tool real no trace", () => {
      const reply = compose({ message: "Confirmo", decision: { ...decision, content: "Veja seus chamados." }, executions: [multiple] });
      assert.equal(reply?.content, CONFIRMATION_REPLY);
      assert.equal(reply?.ticketLookup, null);
      assert.deepEqual(reply?.trace.actions, actionsFrom([multiple]));
      assert.equal(agentTraceSchema.safeParse(reply?.trace).success, true);
    });

    it("descarta proposta do turno", () => {
      const reply = compose({ message: "ok, confirma", executions: [], drafts: [{ outcome: "DRAFTED", proposal }] });
      assert.equal(reply?.ticketDraft, null);
      assert.equal(reply?.content, CONFIRMATION_REPLY);
    });

    it("responde mesmo sem texto do modelo", () => {
      assert.equal(compose({ message: "pode confirmar", decision: null, fallbackText: "" })?.content, CONFIRMATION_REPLY);
    });

    it("o template orienta o botão e não passa por falsa ação", () => {
      assert.match(CONFIRMATION_REPLY, /botão/);
      assert.equal(claimsFalseAction(CONFIRMATION_REPLY), false);
    });

    it("frase com conteúdo segue o fluxo normal", () => {
      const reply = compose({ message: "confirmo que o problema continua no INC-20311", decision: { ...decision, content: "O INC-20311 segue aberto." }, executions: [single] });
      assert.equal(reply?.ticketLookup, single);
      assert.ok(reply?.content.startsWith("O INC-20311 segue aberto."));
    });
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

    it("falha depois de proposta no mesmo turno: vale a falha", () => {
      const reply = compose({ drafts: [drafted, notAvailable] });
      assert.equal(reply?.ticketDraft, null);
      assert.match(reply?.content ?? "", /não está entre os seus chamados abertos/);
    });

    it("falha de rascunho com texto vazio usa o template, não vira 503", () => {
      assert.match(compose({ decision: null, fallbackText: "", drafts: [serviceDown] })?.content ?? "", /indisponível/);
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
      assert.ok(!/ainda não é possível/.test(reply?.content ?? ""));
      assert.match(reply?.content ?? "", /reabrir/);
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
      assert.equal(reply?.content, OUT_OF_SCOPE_REPLY);
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
      assert.equal(reply?.content, OUT_OF_SCOPE_REPLY);
      assert.equal(reply?.trace.intent, "OUT_OF_SCOPE");
      assert.deepEqual(reply?.trace.actions, actionsFrom([multiple]));
    });

    it("não troca a resposta pelo template da consulta", () => {
      for (const execution of [noMatch, noOpen, unavailable]) {
        assert.equal(compose({ decision: outOfScope, executions: [execution] })?.content, OUT_OF_SCOPE_REPLY);
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

  describe("redirecionamento fora de escopo", () => {
    const outOfScope: LlmDecision = { ...decision, content: "Fale com o RH.", intent: "OUT_OF_SCOPE", redirectTo: "RH" };

    it("área válida: texto exato do código e ação no trace", () => {
      const reply = compose({ decision: outOfScope });
      assert.equal(reply?.content, redirectReply("RH"));
      assert.equal(reply?.trace.intent, "OUT_OF_SCOPE");
      assert.deepEqual(reply?.trace.actions, [{ tool: "outOfScopeRedirect", summary: "Encaminhado para o RH.", status: "SUCCESS" }]);
      assert.equal(agentTraceSchema.safeParse(reply?.trace).success, true);
    });

    it("contato escrito pelo modelo é ignorado", () => {
      const reply = compose({ decision: { ...outOfScope, content: "Mande para reembolso@empresa.com ou ligue 4002.", redirectTo: "FINANCEIRO" } });
      assert.equal(reply?.content, redirectReply("FINANCEIRO"));
      assert.ok(!reply?.content.includes("empresa.com"));
    });

    it("sem área conhecida: resposta genérica, sem ação de encaminhamento", () => {
      for (const redirectTo of [null, undefined]) {
        const reply = compose({ decision: { ...outOfScope, content: "Paris.", redirectTo } });
        assert.equal(reply?.content, OUT_OF_SCOPE_REPLY);
        assert.deepEqual(reply?.trace.actions, []);
      }
    });

    it("área inválida vinda do modelo cai no genérico", () => {
      const parsed = parseDecision({ ...outOfScope, redirectTo: "JURIDICO" }, "");
      assert.equal(parsed?.redirectTo, undefined);
      assert.equal(compose({ decision: parsed })?.content, OUT_OF_SCOPE_REPLY);
    });

    it("redirectTo fora de OUT_OF_SCOPE é ignorado", () => {
      const reply = compose({ decision: { ...decision, content: "Vou preparar o chamado de acesso.", intent: "OPEN_TICKET", redirectTo: "FINANCEIRO" } });
      assert.equal(reply?.content, "Vou preparar o chamado de acesso.");
      assert.ok(!reply?.trace.actions.some((action) => action.tool === "outOfScopeRedirect"));
    });

    it("continua anulando consulta, rascunho e transferência", () => {
      const proposal = { kind: "COMPLEMENT" as const, ticket: ticket("INC-20311"), content: "x" };
      const reply = compose({
        decision: { ...outOfScope, redirectTo: "FACILITIES" },
        executions: [single],
        drafts: [{ outcome: "DRAFTED", proposal }],
        handoffs: [{ outcome: "ACCEPTED", proposal: { reason: "EMPLOYEE_REQUEST", summary: "x" } }],
      });
      assert.equal(reply?.content, redirectReply("FACILITIES"));
      assert.equal(reply?.ticketLookup, null);
      assert.equal(reply?.ticketDraft, null);
      assert.equal(reply?.handoff ?? null, null);
      assert.equal(reply?.trace.actions.at(-1)?.tool, "outOfScopeRedirect");
      assert.equal(reply?.trace.actions.find((action) => action.tool === "transferToAnalyst")?.status, "SKIPPED");
    });

    it("texto barrado do modelo mantém o encaminhamento, mas não o entendimento dele", () => {
      const reply = compose({ decision: { ...outOfScope, content: "Encaminhei ao RH o INC-999." } });
      assert.equal(reply?.content, redirectReply("RH"));
      assert.equal(reply?.trace.actions.at(-1)?.tool, "outOfScopeRedirect");
      assert.equal(reply?.trace.understood, "Mensagem não classificada pelo modelo.");
      assert.equal(reply?.trace.confidence, "LOW");
    });

    it("confirmação por texto vale mais que o encaminhamento", () => {
      assert.equal(compose({ message: "confirmo", decision: outOfScope })?.content, CONFIRMATION_REPLY);
    });
  });

  describe("chamado aguardando o funcionário", () => {
    const waiting: TicketLookupResult = {
      outcome: "SINGLE_MATCH",
      openTicketCount: 1,
      totalMatches: 1,
      tickets: [ticket("INC-30", { status: "WAITING_EMPLOYEE", statusLabel: "Aguardando funcionário", dueAt: null, overdue: false })],
    };

    it("template diz que o analista aguarda e o prazo está pausado", () => {
      assert.equal(templateFor(waiting), `Encontrei o chamado INC-30 (Notebook lento): status Aguardando funcionário. ${WAITING_EMPLOYEE_NOTE}`);
    });

    it("o aviso é acrescentado quando o modelo não falou da pausa", () => {
      const reply = compose({ decision: { ...decision, content: "O INC-30 está com o status Aguardando funcionário." }, executions: [waiting] });
      assert.equal(reply?.content, `O INC-30 está com o status Aguardando funcionário. ${WAITING_EMPLOYEE_NOTE}`);
    });

    it("não repete quando o modelo já falou da pausa", () => {
      const content = "O INC-30 aguarda sua resposta; o prazo está pausado.";
      assert.equal(compose({ decision: { ...decision, content }, executions: [waiting] })?.content, content);
    });

    it("se o modelo já disse que o analista aguarda, acrescenta só a pausa", () => {
      const reply = compose({ decision: { ...decision, content: "O INC-30 está aguardando funcionário, pois o analista aguarda a sua resposta." }, executions: [waiting] });
      assert.equal(reply?.content, "O INC-30 está aguardando funcionário, pois o analista aguarda a sua resposta. O prazo fica pausado até lá.");
    });

    it("reconhece 'em pausa' e não confunde 'parado' com a pausa do prazo", () => {
      const paused = "O INC-30 aguarda você; o prazo está em pausa.";
      assert.equal(compose({ decision: { ...decision, content: paused }, executions: [waiting] })?.content, paused);
      const stalled = "O INC-30 está parado aguardando a sua resposta.";
      assert.equal(compose({ decision: { ...decision, content: stalled }, executions: [waiting] })?.content, `${stalled} O prazo fica pausado até lá.`);
    });

    it("'aguardando você' conta como já dito: acrescenta só a pausa", () => {
      const reply = compose({ decision: { ...decision, content: "O INC-30 está aguardando você." }, executions: [waiting] });
      assert.equal(reply?.content, "O INC-30 está aguardando você. O prazo fica pausado até lá.");
    });

    it("prazo citado pelo modelo vira o template", () => {
      for (const content of ["O INC-30 vence em 30/10.", "O INC-30 está com o prazo vencido."]) {
        assert.equal(compose({ decision: { ...decision, content }, executions: [waiting] })?.content, templateFor(waiting), content);
      }
    });

    it("outros status não ganham o aviso", () => {
      const reply = compose({ decision: { ...decision, content: "O INC-20311 está em atendimento." }, executions: [{ ...single, tickets: [ticket("INC-20311")] }] });
      assert.equal(reply?.content, "O INC-20311 está em atendimento.");
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
    assert.equal(reply?.content, `${templateFor(single)} Quer que eu chame um analista?`);
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

describe("central de ajuda", () => {
  const vpn = { slug: "vpn-erro-809", title: "VPN com erro 809", category: "NETWORK_VPN" as const, content: "Reinstale o cliente de VPN. Vale apenas para Windows 10." };
  const hours = { slug: "horario-service-desk", title: "Horário do service desk", category: "OTHER" as const, content: "De segunda a sexta, das 8h às 18h." };
  const found = { outcome: "FOUND" as const, articles: [vpn] };
  const question: LlmDecision = { content: "Reinstale o cliente de VPN pelo portal de softwares e reinicie o computador.", understood: "Dúvida sobre VPN", intent: "QUESTION", confidence: "HIGH", reason: "Artigo cobre o caso" };
  const cited = { ...question, articleSlug: "vpn-erro-809" };

  it("ações do trace saem das buscas reais", () => {
    const reply = compose({ decision: question, articleSearches: [found, { outcome: "FOUND", articles: [vpn, hours] }, { outcome: "NO_MATCH", articles: [] }, { outcome: "UNAVAILABLE", articles: [] }] });
    assert.deepEqual(reply?.trace.actions, [
      { tool: "searchHelpCenter", summary: "Central de ajuda: 1 artigo encontrado (VPN com erro 809).", status: "SUCCESS" },
      { tool: "searchHelpCenter", summary: "Central de ajuda: 2 artigos encontrados (VPN com erro 809; Horário do service desk).", status: "SUCCESS" },
      { tool: "searchHelpCenter", summary: "Central de ajuda: nenhum artigo.", status: "SUCCESS" },
      { tool: "searchHelpCenter", summary: "Central de ajuda indisponível.", status: "ERROR" },
    ]);
  });

  it("slug da busca do turno vira sources, nota de fonte e respostas rápidas", () => {
    const reply = compose({ decision: cited, articleSearches: [found] });
    assert.deepEqual(reply?.trace.sources, [{ kind: "ARTICLE", slug: "vpn-erro-809", title: "VPN com erro 809" }]);
    assert.deepEqual(reply?.quickReplies, HELP_QUICK_REPLIES);
    assert.deepEqual(HELP_QUICK_REPLIES, ["Resolveu, obrigado", "Não resolveu, abrir chamado"]);
    assert.equal(reply?.content, `${cited.content} ${articleNote("VPN com erro 809")}`);
    assert.equal(agentTraceSchema.safeParse(reply?.trace).success, true);
  });

  it("slug fora dos resultados do turno é descartado com motivo no trace", () => {
    const reply = compose({ decision: { ...question, articleSlug: "horario-service-desk" }, articleSearches: [found] });
    assert.equal(reply?.trace.sources, undefined);
    assert.equal(reply?.quickReplies ?? null, null);
    assert.equal(reply?.content, question.content);
    assert.deepEqual(reply?.trace.actions.at(-1), { tool: "citeArticle", summary: "Citação descartada: o artigo não veio da busca deste turno.", status: "SKIPPED" });
  });

  it("sem busca no turno, nenhum slug vale", () => {
    const reply = compose({ decision: cited });
    assert.equal(reply?.trace.sources, undefined);
    assert.equal(reply?.trace.actions.at(-1)?.status, "SKIPPED");
  });

  it("nota de fonte escrita pelo modelo é removida: só o código a escreve", () => {
    const reply = compose({ decision: { ...question, content: `${question.content} ${articleNote("Artigo inventado")}` }, articleSearches: [found] });
    assert.equal(reply?.content, question.content);
    assert.equal(citedArticleIn(reply?.content ?? ""), null);
  });

  it("resposta que é só a nota forjada não é gravada nem citada", () => {
    const reply = compose({ decision: { ...cited, content: articleNote("Artigo inventado") }, articleSearches: [found] });
    assert.equal(citedArticleIn(reply?.content ?? ""), null);
    assert.equal(reply?.trace.sources, undefined);
    assert.equal(reply?.quickReplies ?? null, null);
  });

  it("slug fora do formato também é descartado com motivo no trace", () => {
    const decision = parseDecision({ ...question, articleSlug: "VPN Erro 809!" }, "");
    const reply = compose({ decision, articleSearches: [found] });
    assert.equal(reply?.trace.sources, undefined);
    assert.equal(reply?.trace.actions.at(-1)?.tool, "citeArticle");
  });

  it("fora de escopo nunca cita", () => {
    const reply = compose({ decision: { ...cited, intent: "OUT_OF_SCOPE" }, articleSearches: [found] });
    assert.equal(reply?.content, OUT_OF_SCOPE_REPLY);
    assert.equal(reply?.trace.sources, undefined);
    assert.equal(reply?.quickReplies, null);
    assert.equal(reply?.trace.actions[0]?.tool, "searchHelpCenter");
  });

  it("rascunho vence a citação", () => {
    const drafts: DraftExecution[] = [{ outcome: "NEEDS_AFFECTED_SCOPE" }];
    const reply = compose({ decision: cited, articleSearches: [found], drafts });
    assert.equal(reply?.content, "Quem está sendo afetado?");
    assert.equal(reply?.trace.sources, undefined);
  });

  it("resposta barrada não cita", () => {
    const reply = compose({ decision: { ...cited, content: "Abri o chamado INC-999 para você." }, articleSearches: [found] });
    assert.equal(reply?.trace.sources, undefined);
    assert.equal(reply?.quickReplies ?? null, null);
  });

  it("parseDecision guarda articleSlug e descarta valor inválido", () => {
    assert.equal(parseDecision({ ...question, articleSlug: "vpn-erro-809" }, "")?.articleSlug, "vpn-erro-809");
    assert.equal(parseDecision({ ...question, articleSlug: 42 }, "")?.articleSlug, undefined);
    assert.equal("articleSlug" in llmDecisionSchema.shape, true);
  });

  describe("triedArticleFrom", () => {
    const citation = `Reinstale o cliente. ${articleNote("VPN com erro 809")}`;
    it("vale quando o usuário responde que não resolveu logo depois da citação", () => {
      assert.equal(triedArticleFrom([{ authorType: "AGENT", content: citation }], "Não resolveu, abrir chamado"), "VPN com erro 809");
      assert.equal(triedArticleFrom([{ authorType: "AGENT", content: citation }], "não funcionou"), "VPN com erro 809");
    });

    it("sobrevive à pergunta de afetados", () => {
      const history = [
        { authorType: "AGENT", content: citation },
        { authorType: "EMPLOYEE", content: "Não resolveu, abrir chamado" },
        { authorType: "AGENT", content: "Quem está sendo afetado?" },
      ];
      assert.equal(triedArticleFrom(history, "Só eu"), "VPN com erro 809");
    });

    it("não vale se o usuário disse que resolveu, mudou de assunto ou a criação terminou", () => {
      assert.equal(triedArticleFrom([{ authorType: "AGENT", content: citation }], "Resolveu, obrigado"), null);
      assert.equal(triedArticleFrom([{ authorType: "AGENT", content: citation }, { authorType: "EMPLOYEE", content: "ok" }, { authorType: "AGENT", content: "Certo." }], "não resolveu"), null);
      const done = [
        { authorType: "AGENT", content: citation },
        { authorType: "EMPLOYEE", content: "Não resolveu" },
        { authorType: "AGENT", content: "Coloquei prioridade Média. Confira antes de eu criar:" },
      ];
      assert.equal(triedArticleFrom(done, "Outra coisa"), null);
    });

    it("só lê a nota em mensagem do agent", () => {
      assert.equal(triedArticleFrom([{ authorType: "EMPLOYEE", content: citation }], "Não resolveu"), null);
    });
  });
});
