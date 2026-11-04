import { describe, expect, it } from "vitest";
import { ApiError } from "@/shared/api/api-error";
import { statusChangeFailure } from "./status-change-failure";

const BACKEND_TEXT = "texto do backend que não vai para a tela";
const http = (status: number, code: string) =>
  new ApiError("http", BACKEND_TEXT, { status, code });

const RETRY = "Não foi possível mudar o status agora. Tente de novo.";

describe("statusChangeFailure", () => {
  it("conflito de status pede conferir e recarrega", () => {
    expect(statusChangeFailure(http(409, "TICKET_STATUS_CONFLICT"))).toEqual({
      message:
        "O status deste chamado mudou. Confira o status atual e tente de novo.",
      stale: true,
      retryable: false,
      sessionExpired: false,
    });
  });

  it("transição recusada recarrega", () => {
    expect(
      statusChangeFailure(http(409, "TICKET_TRANSITION_NOT_ALLOWED")),
    ).toMatchObject({
      message: "Essa mudança não é mais permitida para este chamado.",
      stale: true,
    });
  });

  it("chamado sumido recarrega", () => {
    expect(statusChangeFailure(http(404, "TICKET_NOT_FOUND"))).toMatchObject({
      message: "Este chamado não existe mais.",
      stale: true,
    });
  });

  it("400 pede conferir a nota", () => {
    expect(statusChangeFailure(http(400, "INVALID_REQUEST"))).toMatchObject({
      message: "Não foi possível salvar. Confira a nota e tente de novo.",
      stale: false,
      retryable: false,
    });
  });

  it("403 explica o papel", () => {
    expect(statusChangeFailure(http(403, "FORBIDDEN")).message).toBe(
      "Só analistas podem mudar o status.",
    );
  });

  it("401 marca a sessão vencida", () => {
    expect(statusChangeFailure(http(401, "SESSION_INVALID"))).toMatchObject({
      message: "Sua sessão expirou. Entre de novo.",
      sessionExpired: true,
    });
  });

  it.each([
    http(503, "TICKET_SERVICE_UNAVAILABLE"),
    http(500, "INTERNAL_ERROR"),
    new ApiError("unavailable", BACKEND_TEXT),
    new ApiError("invalid-response", BACKEND_TEXT, { status: 200 }),
    new Error(BACKEND_TEXT),
  ])("falha temporária pode repetir (%#)", (error) => {
    expect(statusChangeFailure(error)).toEqual({
      message: RETRY,
      stale: false,
      retryable: true,
      sessionExpired: false,
    });
  });

  it("nunca mostra o texto do backend", () => {
    const errors = [
      http(409, "OUTRO"),
      http(418, "X"),
      http(409, "TICKET_STATUS_CONFLICT"),
    ];
    for (const error of errors) {
      expect(statusChangeFailure(error).message).not.toContain(BACKEND_TEXT);
    }
  });
});
