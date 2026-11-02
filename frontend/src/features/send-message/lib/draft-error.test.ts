import { describe, expect, it } from "vitest";
import { ApiError } from "@/shared/api/api-error";
import { getDraftFailure } from "./draft-error";

const http = (code: string, status: number) =>
  new ApiError("http", "texto do backend", { status, code });

describe("getDraftFailure", () => {
  it("permite repetir quando o serviço de chamados caiu, mantendo o rascunho", () => {
    expect(getDraftFailure(http("TICKET_SERVICE_UNAVAILABLE", 503))).toEqual({
      line: "O serviço de chamados não respondeu agora.",
      retryable: true,
      unavailable: false,
      lock: null,
      sessionExpired: false,
    });
  });

  it.each([
    ["rede", new ApiError("unavailable", "x")],
    ["erro interno", http("INTERNAL_ERROR", 500)],
    ["código desconhecido", http("NEW_THING", 418)],
    ["erro qualquer", new Error("x")],
  ])("usa a linha genérica repetível para %s", (_name, error) => {
    expect(getDraftFailure(error)).toMatchObject({
      line: "Não foi possível concluir agora.",
      retryable: true,
      unavailable: false,
    });
  });

  it("marca o rascunho como indisponível em DRAFT_NOT_FOUND", () => {
    expect(getDraftFailure(http("DRAFT_NOT_FOUND", 404))).toMatchObject({
      line: "Este rascunho não está mais disponível.",
      retryable: false,
      unavailable: true,
    });
  });

  it("marca como indisponível quando o chamado fechou", () => {
    expect(getDraftFailure(http("TICKET_NOT_OPEN", 409))).toMatchObject({
      line: "Este chamado não está mais aberto.",
      retryable: false,
      unavailable: true,
    });
  });

  it("marca como indisponível quando o chamado não pode mais ser reaberto", () => {
    expect(getDraftFailure(http("TICKET_NOT_REOPENABLE", 409))).toMatchObject({
      line: "Este chamado não pode mais ser reaberto.",
      retryable: false,
      unavailable: true,
    });
  });

  it("bloqueia o chat quando a conversa passou a um analista", () => {
    expect(getDraftFailure(http("CONVERSATION_NOT_WITH_AGENT", 409))).toMatchObject({
      line: "Não concluído",
      retryable: false,
      lock: { message: "Esta conversa está com um analista." },
    });
  });

  it("marca sessão expirada em 401", () => {
    expect(getDraftFailure(http("SESSION_INVALID", 401))).toMatchObject({
      sessionExpired: true,
      retryable: false,
    });
  });

  it("não repete requisição recusada", () => {
    expect(getDraftFailure(http("INVALID_REQUEST", 400))).toMatchObject({
      line: "Não conseguimos processar o rascunho.",
      retryable: false,
      unavailable: false,
    });
  });

  it("não repete resposta inesperada, que pode ter gravado", () => {
    expect(
      getDraftFailure(new ApiError("invalid-response", "x", { status: 200 })),
    ).toMatchObject({
      line: "Recebemos uma resposta inesperada.",
      retryable: false,
      unavailable: true,
    });
  });
});
