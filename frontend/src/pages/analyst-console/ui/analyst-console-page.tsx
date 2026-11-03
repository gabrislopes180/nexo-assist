import type { Metadata } from "next";
import { Suspense } from "react";
import { SessionGate } from "@/entities/session";
import { AnalystConsoleSession } from "./analyst-console-session";

export const metadata: Metadata = {
  title: "Conversas | Nexo Assist",
};

// useSearchParams pede um Suspense acima com cacheComponents.
export function AnalystConsolePage() {
  return (
    <SessionGate requiredRole="ANALYST">
      <Suspense
        fallback={
          <div
            role="status"
            className="flex flex-1 items-center justify-center text-body text-ink-3"
          >
            Carregando
          </div>
        }
      >
        <AnalystConsoleSession />
      </Suspense>
    </SessionGate>
  );
}
