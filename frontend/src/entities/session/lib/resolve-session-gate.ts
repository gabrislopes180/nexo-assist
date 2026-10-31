import type { SessionUser } from "../model/session-user";
import { homePathFor } from "./home-path";

interface SessionGateInput {
  /** `undefined` ainda não respondeu; `null` respondeu que não há sessão. */
  data: SessionUser | null | undefined;
  isError: boolean;
  requiredRole?: SessionUser["role"];
}

export type SessionGateDecision =
  | { status: "allowed" }
  | { status: "redirect"; to: string }
  | { status: "error" }
  | { status: "loading" };

export function resolveSessionGate({
  data,
  isError,
  requiredRole,
}: SessionGateInput): SessionGateDecision {
  if (data) {
    return !requiredRole || data.role === requiredRole
      ? { status: "allowed" }
      : { status: "redirect", to: homePathFor(data.role) };
  }
  if (data === null) return { status: "redirect", to: "/login" };
  if (isError) return { status: "error" };
  return { status: "loading" };
}
