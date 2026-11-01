import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_LOOKUP_TICKETS, matchTickets, type MatchableTicket } from "./ticket-matching.js";

const NOW = new Date("2026-11-01T12:00:00.000Z");
const hoursFromNow = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000);

function ticket(overrides: Partial<MatchableTicket> & { code: string }): MatchableTicket {
  return {
    type: "INC",
    category: "OTHER",
    priority: "MEDIUM",
    status: "IN_PROGRESS",
    title: "Título genérico",
    description: "Descrição genérica",
    createdAt: hoursFromNow(-10),
    dueAt: hoursFromNow(10),
    ...overrides,
  };
}

const codesOf = (result: { tickets: { code: string }[] }) => result.tickets.map((t) => t.code);

describe("matchTickets", () => {
  it("sem critérios devolve todos os abertos", () => {
    const result = matchTickets([ticket({ code: "INC-1" }), ticket({ code: "INC-2" })], {}, NOW);
    assert.equal(result.totalMatches, 2);
    assert.deepEqual(codesOf(result), ["INC-1", "INC-2"]);
  });

  it("devolve o resumo do chamado sem description e com datas ISO", () => {
    const createdAt = hoursFromNow(-48);
    const dueAt = hoursFromNow(-1);
    const [summary] = matchTickets([ticket({ code: "INC-1", status: "WAITING_ANALYST", createdAt, dueAt })], {}, NOW).tickets;
    assert.deepEqual(summary, {
      code: "INC-1",
      type: "INC",
      category: "OTHER",
      priority: "MEDIUM",
      status: "WAITING_ANALYST",
      statusLabel: "Aguardando analista",
      title: "Título genérico",
      createdAt: createdAt.toISOString(),
      dueAt: dueAt.toISOString(),
      overdue: true,
    });
  });

  it("mantém dueAt null e overdue false com o prazo pausado", () => {
    const [summary] = matchTickets([ticket({ code: "INC-1", status: "WAITING_EMPLOYEE", dueAt: null })], {}, NOW).tickets;
    assert.equal(summary?.dueAt, null);
    assert.equal(summary?.overdue, false);
  });

  describe("código", () => {
    it("bate sem diferenciar caixa", () => {
      const result = matchTickets([ticket({ code: "INC-1" }), ticket({ code: "INC-2" })], { code: "inc-2" }, NOW);
      assert.deepEqual(codesOf(result), ["INC-2"]);
    });

    it("prevalece sobre os demais critérios", () => {
      const tickets = [ticket({ code: "INC-1", category: "EMAIL" })];
      const result = matchTickets(tickets, { code: "INC-1", category: "HARDWARE", keywords: ["inexistente"] }, NOW);
      assert.deepEqual(codesOf(result), ["INC-1"]);
    });

    it("não acha código parcial", () => {
      assert.equal(matchTickets([ticket({ code: "INC-123" })], { code: "INC-12" }, NOW).totalMatches, 0);
    });
  });

  describe("filtros estruturados", () => {
    const tickets = [
      ticket({ code: "INC-1", type: "INC", category: "EMAIL", priority: "HIGH", status: "IN_PROGRESS" }),
      ticket({ code: "REQ-2", type: "REQ", category: "EMAIL", priority: "HIGH", status: "APPROVED" }),
      ticket({ code: "INC-3", type: "INC", category: "HARDWARE", priority: "HIGH", status: "IN_PROGRESS" }),
    ];

    it("filtra por cada campo", () => {
      assert.deepEqual(codesOf(matchTickets(tickets, { type: "REQ" }, NOW)), ["REQ-2"]);
      assert.deepEqual(codesOf(matchTickets(tickets, { category: "HARDWARE" }, NOW)), ["INC-3"]);
      assert.deepEqual(codesOf(matchTickets(tickets, { status: "APPROVED" }, NOW)), ["REQ-2"]);
      assert.equal(matchTickets(tickets, { priority: "LOW" }, NOW).totalMatches, 0);
    });

    it("combina em E", () => {
      assert.deepEqual(codesOf(matchTickets(tickets, { type: "INC", category: "EMAIL" }, NOW)), ["INC-1"]);
    });

    it("combina em E com as keywords", () => {
      const withWord = [
        ticket({ code: "INC-1", category: "EMAIL", title: "Outlook" }),
        ticket({ code: "INC-2", category: "SOFTWARE", title: "Outlook" }),
      ];
      assert.deepEqual(codesOf(matchTickets(withWord, { category: "EMAIL", keywords: ["outlook"] }, NOW)), ["INC-1"]);
    });
  });

  describe("keywords", () => {
    it("keyword sem acento bate com texto acentuado", () => {
      const tickets = [ticket({ code: "INC-1", title: "Lentidão após atualização" })];
      assert.equal(matchTickets(tickets, { keywords: ["lentidao", "ATUALIZACAO"] }, NOW).totalMatches, 1);
    });

    it("keyword acentuada bate com texto sem acento", () => {
      assert.equal(matchTickets([ticket({ code: "INC-1", title: "Lentidao" })], { keywords: ["lentidão"] }, NOW).totalMatches, 1);
    });

    it("procura também na descrição e no rótulo da categoria", () => {
      const tickets = [ticket({ code: "INC-1", description: "Erro na impressora" }), ticket({ code: "INC-2", category: "NETWORK_VPN" })];
      assert.deepEqual(codesOf(matchTickets(tickets, { keywords: ["impressora"] }, NOW)), ["INC-1"]);
      assert.deepEqual(codesOf(matchTickets(tickets, { keywords: ["rede e vpn"] }, NOW)), ["INC-2"]);
    });

    it("combina em OU", () => {
      const tickets = [ticket({ code: "INC-1", title: "Teclado" }), ticket({ code: "INC-2", title: "Mouse" }), ticket({ code: "INC-3", title: "Monitor" })];
      assert.deepEqual(codesOf(matchTickets(tickets, { keywords: ["teclado", "mouse"] }, NOW)), ["INC-1", "INC-2"]);
    });

    it("mantém só os de maior pontuação", () => {
      const tickets = [ticket({ code: "INC-1", title: "Teclado" }), ticket({ code: "INC-2", title: "Teclado e mouse" })];
      const result = matchTickets(tickets, { keywords: ["teclado", "mouse"] }, NOW);
      assert.equal(result.totalMatches, 1);
      assert.deepEqual(codesOf(result), ["INC-2"]);
    });

    it("não conta duas vezes a mesma keyword escrita de outro jeito", () => {
      const tickets = [ticket({ code: "INC-1", title: "Lentidão" }), ticket({ code: "INC-2", title: "Lentidão e mouse" })];
      assert.equal(matchTickets(tickets, { keywords: ["lentidão", "LENTIDAO"] }, NOW).totalMatches, 2);
    });

    it("keyword só de espaços não casa com tudo", () => {
      const tickets = [ticket({ code: "INC-1", title: "Teclado" }), ticket({ code: "INC-2", title: "Mouse" })];
      assert.deepEqual(codesOf(matchTickets(tickets, { keywords: ["   ", "teclado"] }, NOW)), ["INC-1"]);
    });

    it("só com keywords em branco não há match", () => {
      assert.equal(matchTickets([ticket({ code: "INC-1" })], { keywords: ["   "] }, NOW).totalMatches, 0);
    });

    it("sem nenhuma keyword presente não há match", () => {
      assert.equal(matchTickets([ticket({ code: "INC-1" })], { keywords: ["inexistente"] }, NOW).totalMatches, 0);
    });
  });

  describe("ordenação", () => {
    it("coloca vencidos primeiro e depois prazo crescente", () => {
      const tickets = [
        ticket({ code: "INC-1", dueAt: hoursFromNow(5) }),
        ticket({ code: "INC-2", dueAt: hoursFromNow(-1) }),
        ticket({ code: "INC-3", dueAt: hoursFromNow(1) }),
        ticket({ code: "INC-4", dueAt: hoursFromNow(-3) }),
      ];
      assert.deepEqual(codesOf(matchTickets(tickets, {}, NOW)), ["INC-4", "INC-2", "INC-3", "INC-1"]);
    });

    it("deixa prazo nulo por último", () => {
      const tickets = [ticket({ code: "INC-1", dueAt: null }), ticket({ code: "INC-2", dueAt: hoursFromNow(100) })];
      assert.deepEqual(codesOf(matchTickets(tickets, {}, NOW)), ["INC-2", "INC-1"]);
    });

    it("desempata por createdAt decrescente e depois por código", () => {
      const tickets = [
        ticket({ code: "INC-2", dueAt: null, createdAt: hoursFromNow(-5) }),
        ticket({ code: "INC-1", dueAt: null, createdAt: hoursFromNow(-5) }),
        ticket({ code: "INC-3", dueAt: null, createdAt: hoursFromNow(-1) }),
      ];
      assert.deepEqual(codesOf(matchTickets(tickets, {}, NOW)), ["INC-3", "INC-1", "INC-2"]);
    });

    it("não altera a lista recebida", () => {
      const tickets = [ticket({ code: "INC-1", dueAt: hoursFromNow(5) }), ticket({ code: "INC-2", dueAt: hoursFromNow(1) })];
      matchTickets(tickets, {}, NOW);
      assert.deepEqual(tickets.map((t) => t.code), ["INC-1", "INC-2"]);
    });
  });

  it("corta em 5 mantendo os mais urgentes e informa o total real", () => {
    const tickets = Array.from({ length: 7 }, (_, i) => ticket({ code: `INC-${i + 1}`, dueAt: hoursFromNow(7 - i) }));
    const result = matchTickets(tickets, {}, NOW);
    assert.equal(MAX_LOOKUP_TICKETS, 5);
    assert.equal(result.totalMatches, 7);
    assert.deepEqual(codesOf(result), ["INC-7", "INC-6", "INC-5", "INC-4", "INC-3"]);
  });
});
