import { describe, expect, it } from "vitest";
import type { SessionUser } from "../model/session-user";
import { resolveSessionGate } from "./resolve-session-gate";

const employee: SessionUser = {
  id: "1",
  name: "Ana Souza",
  email: "ana.souza@nexo.example",
  role: "EMPLOYEE",
  department: null,
};
const analyst: SessionUser = { ...employee, role: "ANALYST" };

describe("resolveSessionGate", () => {
  it("mostra a tela quando não há papel exigido", () => {
    expect(resolveSessionGate({ data: analyst, isError: false })).toEqual({
      status: "allowed",
    });
  });

  it("mostra a tela quando o papel confere", () => {
    expect(
      resolveSessionGate({
        data: employee,
        isError: false,
        requiredRole: "EMPLOYEE",
      }),
    ).toEqual({ status: "allowed" });
  });

  it("leva à tela inicial do papel quando ele não confere", () => {
    expect(
      resolveSessionGate({
        data: analyst,
        isError: false,
        requiredRole: "EMPLOYEE",
      }),
    ).toEqual({ status: "redirect", to: "/profile" });
  });

  it("leva ao login quando não há sessão", () => {
    expect(resolveSessionGate({ data: null, isError: false })).toEqual({
      status: "redirect",
      to: "/login",
    });
  });

  it("mostra erro, sem redirecionar, quando a sessão não pôde ser verificada", () => {
    expect(resolveSessionGate({ data: undefined, isError: true })).toEqual({
      status: "error",
    });
  });

  it("mantém a tela quando só a revalidação falhou", () => {
    expect(resolveSessionGate({ data: employee, isError: true })).toEqual({
      status: "allowed",
    });
  });

  it("fica carregando enquanto não há resposta", () => {
    expect(resolveSessionGate({ data: undefined, isError: false })).toEqual({
      status: "loading",
    });
  });
});
