import { StatusBadge } from "@/shared/ui/status-badge";

interface AgentWaitingProps {
  children: string;
}

/** Ocupa o lugar da trilha enquanto o turno roda; sai quando a resposta chega. */
export function AgentWaiting({ children }: AgentWaitingProps) {
  return (
    <div
      aria-hidden="true"
      className="flex flex-wrap items-center gap-x-3 text-caption"
    >
      <span className="text-caption-strong text-ink">Nexo Assist</span>
      <StatusBadge tone="info" pulse>
        {children}
      </StatusBadge>
    </div>
  );
}
