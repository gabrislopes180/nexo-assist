"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Button } from "@/shared/ui/button";
import { useSession } from "../api/use-session";
import { resolveSessionGate } from "../lib/resolve-session-gate";
import type { SessionUser } from "../model/session-user";

interface SessionGateProps {
  requiredRole?: SessionUser["role"];
  children: ReactNode;
}

export function SessionGate({ requiredRole, children }: SessionGateProps) {
  const router = useRouter();
  const { data, isError, refetch, isFetching } = useSession();
  const decision = resolveSessionGate({ data, isError, requiredRole });
  const redirectTo = decision.status === "redirect" ? decision.to : null;

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  if (decision.status === "allowed") return children;

  if (decision.status === "error") {
    return (
      <div className="flex min-h-svh w-full flex-col items-center justify-center gap-4 bg-paper px-4 text-center">
        <p role="alert" className="text-body text-ink">
          Não foi possível verificar sua sessão.
        </p>
        <Button
          variant="secondary"
          aria-disabled={isFetching}
          onClick={() => {
            if (!isFetching) void refetch();
          }}
        >
          Tentar de novo
        </Button>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="flex min-h-svh w-full items-center justify-center bg-paper text-body text-ink-3"
    >
      Carregando
    </div>
  );
}
