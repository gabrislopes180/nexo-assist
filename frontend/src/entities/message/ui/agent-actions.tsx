import { Check, X } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { TrailStep } from "../lib/trail-steps";

/** A mesma trilha de ações no chat e no histórico do console. */
export function AgentActions({ steps }: { steps: readonly TrailStep[] }) {
  return steps.map(({ label, failed }) => {
    const Icon = failed ? X : Check;
    return (
      <span
        key={`${label}|${failed}`}
        className={cn(
          "inline-flex items-center gap-1.25",
          failed ? "text-danger-text" : "text-ink-3",
        )}
      >
        <Icon aria-hidden="true" size={12} />
        {label}
      </span>
    );
  });
}
