"use client";

import { useAuthenticatedUser } from "@/entities/session";
import { AnalystConsole } from "./analyst-console";

/** Outra aba pode trocar o usuário sem esconder a rota: a chave recomeça o console. */
export function AnalystConsoleSession() {
  const { id } = useAuthenticatedUser();

  return <AnalystConsole key={id} />;
}
