import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chatRequestSchema, confirmDraftRequestSchema, proposedAnyDraftSchema, ticketLookupCriteriaSchema, ticketLookupResultSchema, type TicketLookupResult, type TicketSummary } from "./chat.js";

describe("chatRequestSchema", () => {
  it("apara os espaços da mensagem", () => {
    assert.deepEqual(chatRequestSchema.parse({ message: "  oi  " }), { message: "oi" });
  });

  it("aceita conversationId opcional, sem exigir formato de cuid", () => {
    assert.deepEqual(chatRequestSchema.parse({ message: "oi", conversationId: "seed-conv-closed" }), {
      message: "oi",
      conversationId: "seed-conv-closed",
    });
  });

  it("aceita mensagem de 2000 caracteres e recusa a de 2001", () => {
    assert.equal(chatRequestSchema.safeParse({ message: "a".repeat(2000) }).success, true);
    assert.equal(chatRequestSchema.safeParse({ message: "a".repeat(2001) }).success, false);
  });

  it("recusa mensagem vazia depois de aparar", () => {
    assert.equal(chatRequestSchema.safeParse({ message: "   " }).success, false);
  });

  it("recusa conversationId vazio ou com mais de 64 caracteres", () => {
    assert.equal(chatRequestSchema.safeParse({ message: "oi", conversationId: "" }).success, false);
    assert.equal(chatRequestSchema.safeParse({ message: "oi", conversationId: "a".repeat(65) }).success, false);
  });

  it("recusa caractere NUL, que truncaria a mensagem gravada", () => {
    assert.equal(chatRequestSchema.safeParse({ message: "a\u0000b" }).success, false);
  });

  it("recusa campo extra, inclusive um ownerId vindo do cliente", () => {
    assert.equal(chatRequestSchema.safeParse({ message: "oi", ownerId: "outro" }).success, false);
  });
});

describe("ticketLookupCriteriaSchema", () => {
  it("aceita objeto vazio", () => {
    assert.equal(ticketLookupCriteriaSchema.safeParse({}).success, true);
  });

  it("aceita código em minúsculas", () => {
    assert.equal(ticketLookupCriteriaSchema.safeParse({ code: "inc-20311" }).success, true);
  });

  it("recusa código malformado", () => {
    assert.equal(ticketLookupCriteriaSchema.safeParse({ code: "20311" }).success, false);
    assert.equal(ticketLookupCriteriaSchema.safeParse({ code: "BUG-1" }).success, false);
  });

  it("aceita status aberto e recusa RESOLVED", () => {
    assert.equal(ticketLookupCriteriaSchema.safeParse({ status: "IN_PROGRESS" }).success, true);
    assert.equal(ticketLookupCriteriaSchema.safeParse({ status: "RESOLVED" }).success, false);
  });

  it("recusa campo extra, inclusive identificador de usuário", () => {
    assert.equal(ticketLookupCriteriaSchema.safeParse({ ownerId: "outro" }).success, false);
  });

  it("limita keywords a 1..8 itens de 2 a 60 caracteres", () => {
    const keyword = "ab";
    assert.equal(ticketLookupCriteriaSchema.safeParse({ keywords: [] }).success, false);
    assert.equal(ticketLookupCriteriaSchema.safeParse({ keywords: Array(8).fill(keyword) }).success, true);
    assert.equal(ticketLookupCriteriaSchema.safeParse({ keywords: Array(9).fill(keyword) }).success, false);
    assert.equal(ticketLookupCriteriaSchema.safeParse({ keywords: ["a"] }).success, false);
    assert.equal(ticketLookupCriteriaSchema.safeParse({ keywords: ["a".repeat(61)] }).success, false);
  });
});

describe("ticketLookupResultSchema", () => {
  const summary: TicketSummary = {
    code: "INC-1",
    type: "INC",
    category: "HARDWARE",
    priority: "MEDIUM",
    status: "WAITING_EMPLOYEE",
    statusLabel: "Aguardando funcionário",
    title: "Notebook lento",
    createdAt: "2026-11-01T12:00:00.000Z",
    dueAt: null,
    overdue: false,
  };

  const valid: TicketLookupResult[] = [
    { outcome: "NO_OPEN_TICKETS", openTicketCount: 0, totalMatches: 0, tickets: [] },
    { outcome: "NO_MATCH", openTicketCount: 2, totalMatches: 0, tickets: [] },
    { outcome: "SINGLE_MATCH", openTicketCount: 2, totalMatches: 1, tickets: [summary] },
    { outcome: "MULTIPLE_MATCHES", openTicketCount: 7, totalMatches: 7, tickets: [summary, summary] },
    { outcome: "UNAVAILABLE", openTicketCount: null, totalMatches: null, tickets: [] },
  ];

  for (const result of valid) {
    it(`aceita ${result.outcome} sem alterar o valor`, () => {
      assert.deepEqual(ticketLookupResultSchema.parse(result), result);
    });
  }

  it("recusa outcome desconhecido", () => {
    assert.equal(ticketLookupResultSchema.safeParse({ outcome: "OTHER", openTicketCount: 0, totalMatches: 0, tickets: [] }).success, false);
  });

  it("recusa combinações que o tipo não permite", () => {
    const invalid = [
      { outcome: "NO_OPEN_TICKETS", openTicketCount: 1, totalMatches: 0, tickets: [] },
      { outcome: "NO_MATCH", openTicketCount: 1, totalMatches: 0, tickets: [summary] },
      { outcome: "SINGLE_MATCH", openTicketCount: 1, totalMatches: 1, tickets: [] },
      { outcome: "SINGLE_MATCH", openTicketCount: 2, totalMatches: 1, tickets: [summary, summary] },
      { outcome: "UNAVAILABLE", openTicketCount: 0, totalMatches: null, tickets: [] },
    ];
    for (const result of invalid) assert.equal(ticketLookupResultSchema.safeParse(result).success, false);
  });

  it("recusa resumo com description, status resolvido ou data fora de ISO", () => {
    for (const ticket of [{ ...summary, description: "x" }, { ...summary, status: "RESOLVED" }, { ...summary, createdAt: "ontem" }]) {
      const result = { outcome: "SINGLE_MATCH", openTicketCount: 1, totalMatches: 1, tickets: [ticket] };
      assert.equal(ticketLookupResultSchema.safeParse(result).success, false);
    }
  });
});

describe("confirmDraftRequestSchema", () => {
  it("apara o texto", () => {
    assert.deepEqual(confirmDraftRequestSchema.parse({ kind: "COMPLEMENT", content: "  texto  " }), { kind: "COMPLEMENT", content: "texto" });
  });

  it("recusa vazio, longo, com NUL e com campo extra", () => {
    for (const content of ["   ", "a".repeat(2001), "a\u0000b"]) {
      assert.equal(confirmDraftRequestSchema.safeParse({ kind: "COMPLEMENT", content }).success, false);
    }
    for (const body of [{}, { content: "a" }, { kind: "COMPLEMENT" }, { kind: "COMPLEMENT", content: "a", ticketCode: "INC-1" }]) {
      assert.equal(confirmDraftRequestSchema.safeParse(body).success, false);
    }
  });
});

describe("proposedAnyDraftSchema", () => {
  const ticket: TicketSummary = {
    code: "INC-1",
    type: "INC",
    category: "HARDWARE",
    priority: "MEDIUM",
    status: "IN_PROGRESS",
    statusLabel: "Em andamento",
    title: "Notebook lento",
    createdAt: "2026-11-01T12:00:00.000Z",
    dueAt: null,
    overdue: false,
  };

  it("aceita proposta de complemento", () => {
    assert.equal(proposedAnyDraftSchema.safeParse({ kind: "COMPLEMENT", ticket, content: "mais detalhes" }).success, true);
  });

  it("recusa outro kind, id vindo do agent e conteúdo vazio", () => {
    assert.equal(proposedAnyDraftSchema.safeParse({ kind: "CREATE", ticket, content: "x" }).success, false);
    assert.equal(proposedAnyDraftSchema.safeParse({ kind: "COMPLEMENT", ticket, content: "x", id: "1" }).success, false);
    assert.equal(proposedAnyDraftSchema.safeParse({ kind: "COMPLEMENT", ticket, content: " " }).success, false);
  });
});

describe("confirmDraftRequestSchema de CREATE", () => {
  const body = { kind: "CREATE", title: "Título", description: "Descrição", affectedScope: "TEAM" };

  it("aceita os campos editáveis", () => {
    assert.equal(confirmDraftRequestSchema.safeParse(body).success, true);
    assert.equal(confirmDraftRequestSchema.safeParse({ ...body, affectedDescription: "Equipe" }).success, true);
  });

  it("recusa campos travados", () => {
    for (const locked of [{ type: "INC" }, { category: "EMAIL" }, { priority: "LOW" }]) {
      assert.equal(confirmDraftRequestSchema.safeParse({ ...body, ...locked }).success, false);
    }
  });

  it("limita título a 120 e descrição a 2000, sem NUL", () => {
    assert.equal(confirmDraftRequestSchema.safeParse({ ...body, title: "a".repeat(120) }).success, true);
    assert.equal(confirmDraftRequestSchema.safeParse({ ...body, title: "a".repeat(121) }).success, false);
    assert.equal(confirmDraftRequestSchema.safeParse({ ...body, description: "a".repeat(2000) }).success, true);
    assert.equal(confirmDraftRequestSchema.safeParse({ ...body, description: "a".repeat(2001) }).success, false);
    assert.equal(confirmDraftRequestSchema.safeParse({ ...body, description: "a\u0000b" }).success, false);
  });
});

describe("proposedAnyDraftSchema de CREATE", () => {
  const draft = {
    kind: "CREATE",
    type: "INC",
    category: "EMAIL",
    priority: "CRITICAL",
    priorityReason: "Filial parada.",
    title: "Título",
    description: "Descrição",
    affectedScope: "COMPANY",
  };

  it("aceita a proposta", () => {
    assert.equal(proposedAnyDraftSchema.safeParse(draft).success, true);
  });

  it("recusa proposta sem justificativa, com id ou com dono", () => {
    const { priorityReason: _reason, ...withoutReason } = draft;
    for (const invalid of [withoutReason, { ...draft, id: "1" }, { ...draft, ownerId: "x" }, { ...draft, title: "a".repeat(121) }]) {
      assert.equal(proposedAnyDraftSchema.safeParse(invalid).success, false);
    }
  });
});

describe("rascunho de reabertura", () => {
  const ticket = {
    code: "INC-1",
    type: "INC",
    category: "HARDWARE",
    priority: "MEDIUM",
    status: "RESOLVED",
    statusLabel: "Resolvido",
    title: "Teclado",
    createdAt: "2026-11-01T12:00:00.000Z",
    dueAt: null,
    overdue: false,
    canReopen: true,
  };

  it("aceita a proposta e o body de confirmação", () => {
    assert.equal(proposedAnyDraftSchema.safeParse({ kind: "REOPEN", ticket, reason: "voltou" }).success, true);
    assert.deepEqual(confirmDraftRequestSchema.parse({ kind: "REOPEN", reason: "  voltou  " }), { kind: "REOPEN", reason: "voltou" });
  });

  it("recusa motivo vazio, longo ou com NUL, e campos extras", () => {
    for (const reason of ["   ", "a".repeat(2001), "a\u0000b"]) {
      assert.equal(proposedAnyDraftSchema.safeParse({ kind: "REOPEN", ticket, reason }).success, false);
      assert.equal(confirmDraftRequestSchema.safeParse({ kind: "REOPEN", reason }).success, false);
    }
    assert.equal(confirmDraftRequestSchema.safeParse({ kind: "REOPEN", reason: "a", ticketCode: "INC-1" }).success, false);
    assert.equal(proposedAnyDraftSchema.safeParse({ kind: "REOPEN", ticket, reason: "a", id: "1" }).success, false);
  });
});
