import type { ReactNode } from "react";
import { SessionGate } from "@/entities/session";
import { AuthenticatedShell } from "./authenticated-shell";

interface AuthenticatedLayoutProps {
  children: ReactNode;
}

export function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  return (
    <SessionGate>
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </SessionGate>
  );
}
