import { Check, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import type { TrailStep } from "../lib/trail-steps";

interface AgentMessageProps {
  steps: TrailStep[];
  /** Texto puro: a resposta nunca é interpretada como HTML. */
  children: string;
  attachment?: ReactNode;
}

export function AgentMessage({
  steps,
  children,
  attachment,
}: AgentMessageProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-caption">
        <span className="text-caption-strong text-ink">Nexo Assist</span>
        {steps.map(({ label, failed }) => {
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
        })}
      </div>
      <div className="w-full max-w-(--agent-bubble-width) rounded-lg rounded-tl-xs border border-rule bg-paper px-4 py-3">
        <p className="text-body leading-normal wrap-anywhere whitespace-pre-line text-ink">
          {children}
        </p>
      </div>
      {attachment}
    </div>
  );
}
