import type { ReactNode } from "react";
import { SessionGate } from "@/entities/session";

/** Sem a barra lateral: o console tem rail próprio. O papel é checado na página. */
export function ConsoleLayout({ children }: { children: ReactNode }) {
  return <SessionGate>{children}</SessionGate>;
}
