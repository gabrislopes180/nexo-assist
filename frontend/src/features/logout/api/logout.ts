import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { SESSION_QUERY_KEY } from "@/entities/session";
import { apiRequest } from "@/shared/api/http-client";
import { CHAT_QUERY_ROOT, CONSOLE_QUERY_ROOT } from "@/shared/api/query-keys";

export function logout() {
  return apiRequest("/auth/logout", { method: "POST", schema: z.undefined() });
}

export async function signOut(queryClient: QueryClient): Promise<void> {
  await logout();

  await queryClient.cancelQueries({ queryKey: CHAT_QUERY_ROOT });
  queryClient.removeQueries({ queryKey: CHAT_QUERY_ROOT });

  // O próximo analista não pode ver as conversas do anterior.
  queryClient.removeQueries({ queryKey: CONSOLE_QUERY_ROOT });
  // Uma consulta anterior ao logout devolveria o usuário por cima do null.
  await queryClient.cancelQueries({ queryKey: SESSION_QUERY_KEY });
  // O SessionGate vê a sessão nula e leva ao login.
  queryClient.setQueryData(SESSION_QUERY_KEY, null);
}
