import { ApiError } from "@/shared/api/api-error";

export interface StatusChangeFailure {
  message: string;
  /** O detalhe na tela está velho: recarregue e zere o destino. */
  stale: boolean;
  /** Falha temporária: o mesmo envio pode dar certo. */
  retryable: boolean;
  sessionExpired: boolean;
}

const RETRY_MESSAGE = "Não foi possível mudar o status agora. Tente de novo.";

const failure = (
  message: string,
  extra: Partial<StatusChangeFailure> = {},
): StatusChangeFailure => ({
  message,
  stale: false,
  retryable: false,
  sessionExpired: false,
  ...extra,
});

// O texto do backend nunca chega à tela.
export function statusChangeFailure(error: unknown): StatusChangeFailure {
  if (!(error instanceof ApiError) || error.kind !== "http") {
    return failure(RETRY_MESSAGE, { retryable: true });
  }
  if (error.code === "TICKET_STATUS_CONFLICT") {
    return failure(
      "O status deste chamado mudou. Confira o status atual e tente de novo.",
      { stale: true },
    );
  }
  if (error.code === "TICKET_TRANSITION_NOT_ALLOWED") {
    return failure("Essa mudança não é mais permitida para este chamado.", {
      stale: true,
    });
  }
  switch (error.status) {
    case 401:
      return failure("Sua sessão expirou. Entre de novo.", {
        sessionExpired: true,
      });
    case 403:
      return failure("Só analistas podem mudar o status.");
    case 404:
      return failure("Este chamado não existe mais.", { stale: true });
    case 400:
      return failure(
        "Não foi possível salvar. Confira a nota e tente de novo.",
      );
    default:
      return failure(RETRY_MESSAGE, { retryable: true });
  }
}
