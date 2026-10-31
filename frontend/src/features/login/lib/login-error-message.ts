import { ApiError } from "@/shared/api/api-error";

export interface LoginError {
  target: "email" | "banner";
  message: string;
}

const GENERIC_MESSAGE =
  "Não foi possível entrar agora. Tente de novo em instantes ou ligue no ramal 4000.";

export const SESSION_NOT_KEPT_MESSAGE =
  "Não conseguimos manter sua sessão neste navegador. Ligue no ramal 4000.";

export function getLoginError(error: unknown): LoginError {
  const code = error instanceof ApiError ? error.code : undefined;

  if (code === "EMAIL_NOT_FOUND") {
    return {
      target: "email",
      message: "Não encontramos uma conta com esse e-mail.",
    };
  }
  if (code === "INVALID_REQUEST") {
    return {
      target: "banner",
      message: "Não conseguimos processar seus dados. Confira e tente de novo.",
    };
  }
  return { target: "banner", message: GENERIC_MESSAGE };
}
