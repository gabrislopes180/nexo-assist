import { describe, expect, it } from "vitest";
import { ApiError } from "@/shared/api/api-error";
import { getLoginError } from "./login-error-message";

const generic =
  "Não foi possível entrar agora. Tente de novo em instantes ou ligue no ramal 4000.";

function http(status: number, code: string) {
  return new ApiError("http", "mensagem do backend", { status, code });
}

describe("getLoginError", () => {
  it("leva EMAIL_NOT_FOUND ao campo de e-mail", () => {
    expect(getLoginError(http(401, "EMAIL_NOT_FOUND"))).toEqual({
      target: "email",
      message: "Não encontramos uma conta com esse e-mail.",
    });
  });

  it.each([400, 413])("mostra faixa para INVALID_REQUEST %i", (status) => {
    expect(getLoginError(http(status, "INVALID_REQUEST"))).toEqual({
      target: "banner",
      message: "Não conseguimos processar seus dados. Confira e tente de novo.",
    });
  });

  it.each([
    ["INTERNAL_ERROR", http(500, "INTERNAL_ERROR")],
    ["código desconhecido", http(418, "NOVO_CODIGO")],
    ["unavailable", new ApiError("unavailable", "x")],
    ["invalid-response", new ApiError("invalid-response", "x")],
    ["erro inesperado", new Error("x")],
  ])("usa a mensagem geral para %s", (_name, error) => {
    expect(getLoginError(error)).toEqual({ target: "banner", message: generic });
  });
});
