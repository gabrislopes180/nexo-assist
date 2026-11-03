import { StatusBadge } from "@/shared/ui/status-badge";

interface AnalystMessageProps {
  /** Nome de quem atende, como veio do backend. */
  authorName: string;
  /** Texto puro: nunca interpretado como HTML. */
  children: string;
}

/** Mensagem do analista no chat do funcionário: forma do AgentMessage, sem trilha. */
export function AnalystMessage({ authorName, children }: AnalystMessageProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        aria-hidden="true"
        className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption"
      >
        <span className="text-caption-strong text-ink">{authorName}</span>
        <StatusBadge variant="tag" tone="success">
          Analista
        </StatusBadge>
      </div>
      <div className="w-full max-w-(--agent-bubble-width) rounded-lg rounded-tl-xs border border-rule bg-paper px-4 py-3">
        <p className="text-body leading-normal wrap-anywhere whitespace-pre-line text-ink">
          <span className="sr-only">{authorName}: </span>
          {children}
        </p>
      </div>
    </div>
  );
}
