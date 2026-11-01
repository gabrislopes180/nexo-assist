import { describe, expect, it } from "vitest";
import { ApiError } from "@/shared/api/api-error";
import { getChatFailure } from "./chat-error";

const http = (code: string, status = 400) =>
  new ApiError("http", "texto do backend", { status, code });

const NOT_SENT = "Não enviada";
const GENERIC = "Não foi possível enviar sua mensagem.";

describe("getChatFailure", () => {
  it("permite repetir quando o agent não respondeu", () => {
    expect(getChatFailure(http("AGENT_UNAVAILABLE", 503))).toEqual({
      line: "Não enviada · O assistente não respondeu agora.",
      retryable: true,
      lock: null,
      clearConversation: false,
      sessionExpired: false,
    });
  });

  it.each([
    ["INTERNAL_ERROR", http("INTERNAL_ERROR", 500)],
    ["unavailable", new ApiError("unavailable", "x")],
    ["código desconhecido", http("SOMETHING_NEW")],
    ["erro que não é da API", new Error("boom")],
    ["valor qualquer", "boom"],
  ])("usa a linha genérica repetível para %s", (_name, error) => {
    expect(getChatFailure(error)).toMatchObject({
      line: GENERIC,
      retryable: true,
      lock: null,
    });
  });

  it("não repete resposta inválida, pois o turno foi gravado", () => {
    const error = new ApiError("invalid-response", "x", { status: 200 });

    expect(getChatFailure(error)).toMatchObject({
      line: "Recebemos uma resposta inesperada.",
      retryable: false,
      lock: null,
    });
  });

  it.each([
    [
      "CONVERSATION_MESSAGE_LIMIT_REACHED",
      "Você chegou ao limite de 30 mensagens nesta conversa.",
    ],
    ["CONVERSATION_CLOSED", "Esta conversa foi encerrada."],
    ["CONVERSATION_NOT_WITH_AGENT", "Esta conversa está com um analista."],
  ])("bloqueia o chat em %s", (code, message) => {
    expect(getChatFailure(http(code, 409))).toEqual({
      line: NOT_SENT,
      retryable: false,
      lock: { message },
      clearConversation: false,
      sessionExpired: false,
    });
  });

  it("bloqueia e apaga o id quando a conversa sumiu", () => {
    expect(getChatFailure(http("CONVERSATION_NOT_FOUND", 404))).toEqual({
      line: NOT_SENT,
      retryable: false,
      lock: { message: "Esta conversa não está mais disponível." },
      clearConversation: true,
      sessionExpired: false,
    });
  });

  it.each(["SESSION_MISSING", "SESSION_INVALID"])(
    "marca a sessão como expirada em %s",
    (code) => {
      expect(getChatFailure(http(code, 401))).toMatchObject({
        line: NOT_SENT,
        retryable: false,
        lock: null,
        sessionExpired: true,
      });
    },
  );

  it("trata qualquer 401 como sessão expirada", () => {
    expect(getChatFailure(http("OTHER", 401)).sessionExpired).toBe(true);
  });

  it.each(["INVALID_REQUEST", "FORBIDDEN"])("não repete %s", (code) => {
    expect(getChatFailure(http(code))).toMatchObject({
      line: "Não conseguimos processar sua mensagem.",
      retryable: false,
      lock: null,
    });
  });

  it("nunca expõe o texto do backend", () => {
    const failure = getChatFailure(http("AGENT_UNAVAILABLE", 503));

    expect(failure.line).not.toContain("texto do backend");
  });
});
