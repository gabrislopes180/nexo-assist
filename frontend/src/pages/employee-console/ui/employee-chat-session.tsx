"use client";

import { useAuthenticatedUser } from "@/entities/session";
import { EmployeeChat } from "./employee-chat";

/** Outra aba pode trocar o usuário sem esconder a rota: a chave recomeça o chat. */
export function EmployeeChatSession() {
  const { id } = useAuthenticatedUser();

  return <EmployeeChat key={id} />;
}
