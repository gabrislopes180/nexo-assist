import { describe, expect, it } from "vitest";
import {
  buildStatusChangeRequest,
  NOTE_MAX,
  statusChangeFormSchema,
} from "./status-change-form";

const required = ["WAITING_EMPLOYEE", "RESOLVED"] as const;
const schema = statusChangeFormSchema(required);

describe("buildStatusChangeRequest", () => {
  it("manda destino, status visto e conversa, sem nota vazia", () => {
    expect(
      buildStatusChangeRequest({
        toStatus: "IN_PROGRESS",
        note: "   ",
        expectedStatus: "WAITING_ANALYST",
        conversationId: "c1",
      }),
    ).toStrictEqual({
      toStatus: "IN_PROGRESS",
      expectedStatus: "WAITING_ANALYST",
      conversationId: "c1",
    });
  });

  it("tira os espaços da nota", () => {
    expect(
      buildStatusChangeRequest({
        toStatus: "RESOLVED",
        note: "  Troquei o cabo.  ",
        expectedStatus: "IN_PROGRESS",
        conversationId: "c1",
      }),
    ).toStrictEqual({
      toStatus: "RESOLVED",
      expectedStatus: "IN_PROGRESS",
      note: "Troquei o cabo.",
      conversationId: "c1",
    });
  });
});

describe("statusChangeFormSchema", () => {
  it("exige o destino", () => {
    const parsed = schema.safeParse({ toStatus: null, note: "" });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["toStatus"]);
  });

  it("aceita destino sem nota quando ela é opcional", () => {
    expect(
      schema.safeParse({ toStatus: "IN_PROGRESS", note: "" }).success,
    ).toBe(true);
  });

  it("exige nota no aguardando funcionário, com texto próprio", () => {
    const parsed = schema.safeParse({
      toStatus: "WAITING_EMPLOYEE",
      note: "   ",
    });
    expect(parsed.error?.issues).toMatchObject([
      { path: ["note"], message: "Conte o que falta do funcionário." },
    ]);
  });

  it("exige nota no resolvido", () => {
    const parsed = schema.safeParse({ toStatus: "RESOLVED", note: "" });
    expect(parsed.error?.issues).toMatchObject([
      { path: ["note"], message: "Descreva a solução aplicada." },
    ]);
  });

  it("segue a lista do backend, não uma regra fixa", () => {
    const relaxed = statusChangeFormSchema([]);
    expect(relaxed.safeParse({ toStatus: "RESOLVED", note: "" }).success).toBe(
      true,
    );
  });

  it("recusa nota acima do limite depois do trim", () => {
    const over = schema.safeParse({
      toStatus: "IN_PROGRESS",
      note: "a".repeat(NOTE_MAX + 1),
    });
    const atLimit = schema.safeParse({
      toStatus: "IN_PROGRESS",
      note: ` ${"a".repeat(NOTE_MAX)} `,
    });
    expect(over.error?.issues[0]?.message).toBe(
      "Use até 1000 caracteres na nota.",
    );
    expect(atLimit.success).toBe(true);
  });
});
