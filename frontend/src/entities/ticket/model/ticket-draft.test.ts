import { describe, expect, it } from "vitest";
import { ticketDraftSchema } from "./ticket-draft";

const ticket = {
  code: "INC-20311",
  type: "INC",
  category: "HARDWARE",
  priority: "MEDIUM",
  status: "WAITING_ANALYST",
  statusLabel: "Aguardando analista",
  title: "Notebook lento",
  createdAt: "2026-10-16T17:20:00.000Z",
  dueAt: null,
  overdue: false,
};

const create = {
  id: "d1",
  kind: "CREATE",
  type: "INC",
  category: "NETWORK_VPN",
  priority: "HIGH",
  title: "VPN não conecta",
  description: "Erro 809 desde ontem.",
  affectedScope: "INDIVIDUAL",
  dueAtPreview: "2026-10-20T16:43:00.000Z",
};

describe("ticketDraftSchema", () => {
  it("aceita o rascunho de criação, com detalhe de afetados opcional", () => {
    expect(ticketDraftSchema.parse(create).kind).toBe("CREATE");
    expect(
      ticketDraftSchema.parse({ ...create, affectedDescription: "Só eu" }),
    ).toMatchObject({ affectedDescription: "Só eu" });
  });

  it("aceita o rascunho de complemento", () => {
    const draft = { id: "d2", kind: "COMPLEMENT", ticket, content: "Reiniciei." };
    expect(ticketDraftSchema.parse(draft)).toMatchObject({
      kind: "COMPLEMENT",
      content: "Reiniciei.",
    });
  });

  it("descarta campo extra, como priorityReason", () => {
    const parsed = ticketDraftSchema.parse({ ...create, priorityReason: "x" });
    expect(parsed).not.toHaveProperty("priorityReason");
  });

  it("recusa kind e abrangência desconhecidos", () => {
    expect(ticketDraftSchema.safeParse({ ...create, kind: "REOPEN" }).success).toBe(false);
    expect(
      ticketDraftSchema.safeParse({ ...create, affectedScope: "WORLD" }).success,
    ).toBe(false);
  });
});
