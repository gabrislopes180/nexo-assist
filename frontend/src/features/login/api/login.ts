import type { QueryClient } from "@tanstack/react-query";
import {
  getSession,
  SESSION_QUERY_KEY,
  sessionResponseSchema,
  type SessionUser,
} from "@/entities/session";
import { apiRequest } from "@/shared/api/http-client";

export function login(email: string) {
  return apiRequest("/auth/login", {
    method: "POST",
    body: { email },
    schema: sessionResponseSchema,
  });
}

/**
 * Entra e confirma por /auth/me que o cookie ficou no navegador.
 * `null` significa que o login respondeu 200, mas a sessão não foi mantida.
 */
export async function signIn(
  queryClient: QueryClient,
  email: string,
): Promise<SessionUser | null> {
  await login(email);

  // Uma consulta anterior ao login devolveria null e seria reaproveitada.
  await queryClient.cancelQueries({ queryKey: SESSION_QUERY_KEY });
  return queryClient.fetchQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: getSession,
    staleTime: 0,
    retry: false,
  });
}
