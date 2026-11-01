import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pendingDraftSchema } from "./conversation-draft.js";
import { loginRequestSchema } from "./session.js";
import { agentTraceSchema } from "./transparency.js";

const validTrace = {
  understood: "Funcionário quer saber o status do chamado",
  intent: "CHECK_TICKET",
  actions: [{ tool: "listMyTickets", summary: "Consultou os chamados abertos", status: "SUCCESS" }],
  confidence: "HIGH",
  reason: "Pedido explícito",
};

describe("agentTraceSchema", () => {
  it("aceita um registro válido", () => {
    assert.equal(agentTraceSchema.safeParse(validTrace).success, true);
  });

  it("aceita lista de ações vazia", () => {
    assert.equal(agentTraceSchema.safeParse({ ...validTrace, actions: [] }).success, true);
  });

  it("rejeita intent desconhecida", () => {
    assert.equal(agentTraceSchema.safeParse({ ...validTrace, intent: "DELETE_ALL" }).success, false);
  });

  it("rejeita status de ação desconhecido e campos faltando", () => {
    const badAction = { ...validTrace, actions: [{ tool: "x", summary: "y", status: "OK" }] };
    assert.equal(agentTraceSchema.safeParse(badAction).success, false);
    const { reason: _reason, ...withoutReason } = validTrace;
    assert.equal(agentTraceSchema.safeParse(withoutReason).success, false);
  });
});

describe("loginRequestSchema", () => {
  it("normaliza espaços e maiúsculas do e-mail", () => {
    assert.deepEqual(loginRequestSchema.parse({ email: "  Pessoa@Nexo.Example " }), { email: "pessoa@nexo.example" });
  });

  it("descarta password de qualquer tipo e outros campos", () => {
    for (const password of ["errada", "", 123, null, { a: 1 }]) {
      const parsed = loginRequestSchema.parse({ email: "pessoa@nexo.example", password, rememberMe: true });
      assert.deepEqual(parsed, { email: "pessoa@nexo.example" });
    }
  });

  it("rejeita e-mail ausente, de outro tipo, malformado ou acima de 254 caracteres", () => {
    for (const body of [{}, undefined, { email: 1 }, { email: "" }, { email: "sem-arroba" }, { email: `${"a".repeat(250)}@b.co` }]) {
      assert.equal(loginRequestSchema.safeParse(body).success, false);
    }
  });
});

describe("pendingDraftSchema", () => {
  const common = { draftId: "draft_1", createdAt: "2026-11-09T13:00:00.000Z" };

  it("aceita rascunho CREATE com os enums do Prisma", () => {
    const draft = {
      ...common,
      kind: "CREATE",
      type: "INC",
      category: "EMAIL",
      priority: "MEDIUM",
      title: "Outlook não sincroniza",
      description: "Caixa compartilhada parada desde ontem",
      affectedScope: "TEAM",
      affectedDescription: "Equipe Comercial",
    };
    assert.equal(pendingDraftSchema.safeParse(draft).success, true);
  });

  it("affectedDescription é opcional", () => {
    const draft = {
      ...common,
      kind: "CREATE",
      type: "REQ",
      category: "SOFTWARE",
      priority: "LOW",
      title: "Licença",
      description: "Power BI Pro",
      affectedScope: "INDIVIDUAL",
    };
    assert.equal(pendingDraftSchema.safeParse(draft).success, true);
  });

  it("rejeita categoria fora do enum", () => {
    const draft = {
      ...common,
      kind: "CREATE",
      type: "INC",
      category: "PRINTER",
      priority: "LOW",
      title: "t",
      description: "d",
      affectedScope: "INDIVIDUAL",
    };
    assert.equal(pendingDraftSchema.safeParse(draft).success, false);
  });

  it("aceita COMPLEMENT e recusa conteúdo vazio", () => {
    assert.equal(pendingDraftSchema.safeParse({ ...common, kind: "COMPLEMENT", ticketCode: "INC-1", content: "c" }).success, true);
    assert.equal(pendingDraftSchema.safeParse({ ...common, kind: "COMPLEMENT", ticketCode: "INC-1", content: "" }).success, false);
  });

  it("aceita UPDATE e REOPEN", () => {
    assert.equal(pendingDraftSchema.safeParse({ ...common, kind: "UPDATE", ticketCode: "INC-20311", comment: "c" }).success, true);
    assert.equal(pendingDraftSchema.safeParse({ ...common, kind: "REOPEN", ticketCode: "INC-20150", reason: "voltou" }).success, true);
  });

  it("rejeita kind desconhecido e campos do kind errado", () => {
    assert.equal(pendingDraftSchema.safeParse({ ...common, kind: "DELETE", ticketCode: "INC-1" }).success, false);
    assert.equal(pendingDraftSchema.safeParse({ ...common, kind: "REOPEN", ticketCode: "INC-20150", comment: "x" }).success, false);
  });

  it("rejeita createdAt que não é data ISO", () => {
    assert.equal(pendingDraftSchema.safeParse({ ...common, createdAt: "ontem", kind: "UPDATE", ticketCode: "INC-1", comment: "c" }).success, false);
  });
});
