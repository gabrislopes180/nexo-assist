import { describe, expect, it } from "vitest";
import { ApiError } from "@/shared/api/api-error";
import { articleFailure } from "./article-failure";

const http = (status: number, code: string) =>
  new ApiError("http", "mensagem do backend", { status, code });

describe("articleFailure", () => {
  it("404: o artigo saiu da central, sem tentar de novo", () => {
    expect(articleFailure(http(404, "ARTICLE_NOT_FOUND"))).toEqual({
      line: "Este artigo não está mais na central de ajuda.",
      retryable: false,
    });
  });

  it("503: central indisponível, com tentar de novo", () => {
    expect(articleFailure(http(503, "HELP_CENTER_UNAVAILABLE"))).toEqual({
      line: "A central de ajuda está indisponível agora.",
      retryable: true,
    });
  });

  it("401: sessão expirada, sem tentar de novo", () => {
    expect(articleFailure(http(401, "SESSION_INVALID"))).toEqual({
      line: "Sua sessão expirou. Entre de novo para ler o artigo.",
      retryable: false,
    });
  });

  it.each([
    new ApiError("unavailable", "A API não respondeu."),
    new ApiError("invalid-response", "Resposta fora do formato.", { status: 200 }),
    http(500, "INTERNAL_ERROR"),
    new Error("qualquer"),
  ])("outras falhas: mensagem genérica, com tentar de novo (%#)", (error) => {
    expect(articleFailure(error)).toEqual({
      line: "Não foi possível carregar o artigo.",
      retryable: true,
    });
  });

  it("nunca mostra a mensagem do backend", () => {
    expect(articleFailure(http(418, "X")).line).not.toContain("backend");
  });
});
