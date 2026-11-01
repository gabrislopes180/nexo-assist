import { DEFAULT_MESSAGE_LIMIT } from "@/entities/conversation";
import { ApiError } from "@/shared/api/api-error";
import type { ChatFailure } from "../model/chat-reducer";

const NOT_SENT = "Não enviada";

function failure(
  line: string,
  overrides: Partial<Omit<ChatFailure, "line">> = {},
): ChatFailure {
  return {
    line,
    retryable: false,
    lock: null,
    clearConversation: false,
    sessionExpired: false,
    ...overrides,
  };
}

const lockedFailure = (message: string, clearConversation = false) =>
  failure(NOT_SENT, { lock: { message }, clearConversation });

// O texto do backend nunca chega à tela: cada código tem a sua linha aqui.
export function getChatFailure(error: unknown): ChatFailure {
  const generic = failure("Não foi possível enviar sua mensagem.", {
    retryable: true,
  });
  if (!(error instanceof ApiError)) return generic;

  // Status 200: o turno foi gravado, e repetir duplicaria a mensagem.
  if (error.kind === "invalid-response") {
    return failure("Recebemos uma resposta inesperada.");
  }
  if (error.status === 401) {
    return failure(NOT_SENT, { sessionExpired: true });
  }

  switch (error.code) {
    case "AGENT_UNAVAILABLE":
      return failure("Não enviada · O assistente não respondeu agora.", {
        retryable: true,
      });
    case "CONVERSATION_MESSAGE_LIMIT_REACHED":
      return lockedFailure(
        `Você chegou ao limite de ${DEFAULT_MESSAGE_LIMIT} mensagens nesta conversa.`,
      );
    case "CONVERSATION_CLOSED":
      return lockedFailure("Esta conversa foi encerrada.");
    case "CONVERSATION_NOT_WITH_AGENT":
      return lockedFailure("Esta conversa está com um analista.");
    case "CONVERSATION_NOT_FOUND":
      return lockedFailure("Esta conversa não está mais disponível.", true);
    case "INVALID_REQUEST":
    case "FORBIDDEN":
      return failure("Não conseguimos processar sua mensagem.");
    default:
      return generic;
  }
}
