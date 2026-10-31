import type { SessionUser } from "../model/session-user";
import { useSession } from "./use-session";

/** Só para quem está dentro de `SessionGate`, que garante o usuário. */
export function useAuthenticatedUser(): SessionUser {
  const { data } = useSession();
  if (!data) {
    throw new Error("useAuthenticatedUser precisa estar dentro de SessionGate.");
  }
  return data;
}
