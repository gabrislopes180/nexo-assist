import { ApiError } from "@/shared/api/api-error";

export interface ConsoleActionFailure {
  message: string;
  /** A lista está desatualizada: invalide e mostre o estado novo. */
  stale: boolean;
  sessionExpired: boolean;
}

const FALLBACK = {
  takeover: "Não foi possível assumir o atendimento. Tente de novo.",
  return: "Não foi possível devolver ao agent. Tente de novo.",
} as const;

// O texto do backend nunca chega à tela.
export function consoleActionFailure(
  error: unknown,
  action: keyof typeof FALLBACK,
): ConsoleActionFailure {
  const failure = (
    message: string,
    extra: Partial<ConsoleActionFailure> = {},
  ) => ({
    message,
    stale: false,
    sessionExpired: false,
    ...extra,
  });
  if (!(error instanceof ApiError)) return failure(FALLBACK[action]);

  if (error.status === 401) {
    return failure("Sua sessão expirou. Entre de novo.", {
      sessionExpired: true,
    });
  }
  if (error.code === "CONVERSATION_NOT_WAITING") {
    return failure("Esta conversa não está mais esperando atendente.", {
      stale: true,
    });
  }
  if (error.status === 404) {
    return failure("Esta conversa não existe mais.", { stale: true });
  }
  return failure(FALLBACK[action]);
}
