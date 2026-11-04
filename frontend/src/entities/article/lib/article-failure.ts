import { ApiError } from "@/shared/api/api-error";

export interface ArticleFailure {
  line: string;
  /** Falso quando repetir não muda nada (artigo removido, sessão expirada). */
  retryable: boolean;
}

const GENERIC: ArticleFailure = {
  line: "Não foi possível carregar o artigo.",
  retryable: true,
};

/** O texto vem daqui, nunca da mensagem do backend. */
export function articleFailure(error: unknown): ArticleFailure {
  if (!(error instanceof ApiError) || error.kind !== "http") return GENERIC;

  switch (error.status) {
    case 404:
      return {
        line: "Este artigo não está mais na central de ajuda.",
        retryable: false,
      };
    case 401:
      return {
        line: "Sua sessão expirou. Entre de novo para ler o artigo.",
        retryable: false,
      };
    case 503:
      return {
        line: "A central de ajuda está indisponível agora.",
        retryable: true,
      };
    default:
      return GENERIC;
  }
}
