import { describe, expect, it } from "vitest";
import type { ConsoleConversation } from "@/entities/conversation";
import { footerState } from "./footer-state";

const base = {
  status: "WAITING_ANALYST",
  analyst: null,
  assignedToMe: false,
} as const;
const conv = (overrides: Partial<ConsoleConversation>) =>
  ({ ...base, ...overrides }) as ConsoleConversation;

describe("footerState", () => {
  it("mostra a barra de atendimento na espera", () => {
    expect(footerState(conv({}))).toEqual({ kind: "takeover" });
  });

  it.each([
    [{ status: "WITH_AGENT" }, "O Nexo Assist está atendendo esta conversa"],
    [
      {
        status: "WITH_ANALYST",
        assignedToMe: true,
        analyst: { id: "a", name: "Rafael Lima" },
      },
      "Responder ao funcionário ainda não está disponível",
    ],
    [
      { status: "WITH_ANALYST", analyst: { id: "b", name: "Bruno Martins" } },
      "Bruno está atendendo esta conversa",
    ],
    [{ status: "CLOSED" }, "Conversa encerrada"],
  ] as const)("bloqueia o composer em %o", (overrides, text) => {
    expect(footerState(conv(overrides))).toEqual({ kind: "locked", text });
  });
});
