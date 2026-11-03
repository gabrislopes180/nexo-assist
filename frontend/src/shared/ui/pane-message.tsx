import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

interface PaneMessageProps {
  children: ReactNode;
  tone?: "muted" | "error";
  /** Botão secondary ("Tentar de novo") ou ghost ("Limpar busca"). */
  action?: ReactNode;
}

export function PaneMessage({
  children,
  tone = "muted",
  action,
}: PaneMessageProps) {
  const isError = tone === "error";
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <p
        role={isError ? "alert" : undefined}
        className={cn("text-small", isError ? "text-ink-2" : "text-ink-3")}
      >
        {children}
      </p>
      {action}
    </div>
  );
}
