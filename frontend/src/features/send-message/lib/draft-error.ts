import { ApiError } from "@/shared/api/api-error";
import type { DraftFailure } from "../model/chat-reducer";

function failure(
  line: string,
  overrides: Partial<Omit<DraftFailure, "line">> = {},
): DraftFailure {
  return {
    line,
    retryable: false,
    unavailable: false,
    lock: null,
    sessionExpired: false,
    ...overrides,
  };
}

// Erros de Confirmar e Cancelar. O texto do backend nunca chega à tela.
export function getDraftFailure(error: unknown): DraftFailure {
  const generic = failure("Não foi possível concluir agora.", {
    retryable: true,
  });
  if (!(error instanceof ApiError)) return generic;

  // Status 200: a ação pode ter sido gravada, então o rascunho sai de cena.
  if (error.kind === "invalid-response") {
    return failure("Recebemos uma resposta inesperada.", { unavailable: true });
  }
  if (error.status === 401) {
    return failure("Não concluído", { sessionExpired: true });
  }

  switch (error.code) {
    case "TICKET_SERVICE_UNAVAILABLE":
      return failure("O serviço de chamados não respondeu agora.", {
        retryable: true,
      });
    case "DRAFT_NOT_FOUND":
      return failure("Este rascunho não está mais disponível.", {
        unavailable: true,
      });
    case "TICKET_NOT_OPEN":
      return failure("Este chamado não está mais aberto.", {
        unavailable: true,
      });
    case "TICKET_NOT_REOPENABLE":
      return failure("Este chamado não pode mais ser reaberto.", {
        unavailable: true,
      });
    case "CONVERSATION_NOT_WITH_AGENT":
      return failure("Não concluído", {
        lock: { message: "Um analista vai continuar o atendimento por aqui." },
      });
    case "INVALID_REQUEST":
    case "FORBIDDEN":
      return failure("Não conseguimos processar o rascunho.");
    default:
      return generic;
  }
}
