import { describe, expect, it } from "vitest";
import type { TicketDraft } from "../model/ticket-draft";
import {
  draftCardFields,
  draftConfirmBody,
  initialDraftValues,
  validateDraftValues,
} from "./ticket-draft-fields";

const create: Extract<TicketDraft, { kind: "CREATE" }> = {
  id: "d1",
  kind: "CREATE",
  type: "INC",
  category: "NETWORK_VPN",
  priority: "HIGH",
  title: "VPN não conecta",
  description: "Erro 809.",
  affectedScope: "INDIVIDUAL",
  affectedDescription: "Só no notebook dela",
  dueAtPreview: "2026-10-20T13:43:00",
};

const complement: Extract<TicketDraft, { kind: "COMPLEMENT" }> = {
  id: "d2",
  kind: "COMPLEMENT",
  content: "Reiniciei e não resolveu.",
  ticket: {
    code: "INC-20311",
    type: "INC",
    category: "HARDWARE",
    priority: "MEDIUM",
    status: "WAITING_ANALYST",
    statusLabel: "Aguardando analista",
    title: "Notebook lento",
    createdAt: "2026-10-16T14:20:00",
    dueAt: null,
    overdue: false,
  },
};

const now = new Date("2026-10-20T10:00:00");

describe("draftCardFields", () => {
  it("monta Categoria, Prioridade com prazo e Afetados", () => {
    const fields = draftCardFields(create, initialDraftValues(create), now);

    expect(fields).toEqual([
      { label: "Categoria", value: "Rede e VPN" },
      {
        label: "Prioridade",
        value: "Alta",
        dot: "warning",
        note: "· resposta até 13:43",
      },
      { label: "Afetados", value: "Somente você" },
    ]);
  });

  it("mostra a data no prazo de outro dia", () => {
    const fields = draftCardFields(
      { ...create, dueAtPreview: "2026-10-22T09:00:00" },
      initialDraftValues(create),
      now,
    );
    expect(fields[1]?.note).toBe("· resposta até 22 out, 09:00");
  });

  it("usa a abrangência editada", () => {
    const fields = draftCardFields(
      create,
      { kind: "CREATE", title: "t", description: "d", affectedScope: "COMPANY" },
      now,
    );
    expect(fields[2]?.value).toBe("Toda a empresa");
  });

  it("usa os campos do chamado no complemento", () => {
    const labels = draftCardFields(complement, initialDraftValues(complement), now).map(
      (field) => field.label,
    );
    expect(labels).toEqual(["Categoria", "Prioridade", "Aberto em"]);
  });
});

describe("validateDraftValues", () => {
  it("aceita valores dentro dos limites", () => {
    expect(validateDraftValues(initialDraftValues(create))).toEqual({});
    expect(validateDraftValues(initialDraftValues(complement))).toEqual({});
  });

  it("exige título, descrição e complemento", () => {
    expect(
      validateDraftValues({
        kind: "CREATE",
        title: "  ",
        description: "\0",
        affectedScope: "TEAM",
      }),
    ).toEqual({ title: "Escreva um título.", description: "Escreva a descrição." });
    expect(validateDraftValues({ kind: "COMPLEMENT", content: "" })).toEqual({
      content: "Escreva o complemento.",
    });
  });

  it("limita título a 120 e textos a 2.000 caracteres", () => {
    expect(
      validateDraftValues({
        kind: "CREATE",
        title: "a".repeat(121),
        description: "a".repeat(2001),
        affectedScope: "TEAM",
      }),
    ).toEqual({
      title: "Use até 120 caracteres.",
      description: "Use até 2.000 caracteres.",
    });
    expect(
      validateDraftValues({ kind: "COMPLEMENT", content: "a".repeat(2001) }),
    ).toEqual({ content: "Use até 2.000 caracteres." });
  });
});

describe("draftConfirmBody", () => {
  it("envia só os campos editáveis da criação, limpos", () => {
    expect(
      draftConfirmBody(create, {
        kind: "CREATE",
        title: " Novo título\0 ",
        description: "Desc",
        affectedScope: "INDIVIDUAL",
      }),
    ).toEqual({
      kind: "CREATE",
      title: "Novo título",
      description: "Desc",
      affectedScope: "INDIVIDUAL",
      affectedDescription: "Só no notebook dela",
    });
  });

  it("descarta o detalhe de afetados quando a abrangência muda", () => {
    const body = draftConfirmBody(create, {
      kind: "CREATE",
      title: "t",
      description: "d",
      affectedScope: "TEAM",
    });
    expect(body).not.toHaveProperty("affectedDescription");
  });

  it("envia o texto do complemento", () => {
    expect(
      draftConfirmBody(complement, { kind: "COMPLEMENT", content: " Texto " }),
    ).toEqual({ kind: "COMPLEMENT", content: "Texto" });
  });
});
