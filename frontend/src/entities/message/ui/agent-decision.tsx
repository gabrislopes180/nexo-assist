import { ChevronDown } from "lucide-react";
import type { AgentAction, AgentTrace } from "../model/message";

const CONFIDENCE = { HIGH: "Alta", MEDIUM: "Média", LOW: "Baixa" } as const;
const ACTION_STATUS: Record<AgentAction["status"], string> = {
  SUCCESS: "Realizada",
  ERROR: "Falhou",
  SKIPPED: "Não realizada",
};

/** Explicação já registrada no servidor; expandir não faz nenhuma requisição. */
export function AgentDecision({ trace }: { trace?: AgentTrace | null }) {
  if (!trace) return null;
  const actions = trace.actions.filter((action) => action.summary.trim() !== "");
  if (!trace.understood && actions.length === 0 && !trace.confidence && !trace.reason) {
    return null;
  }

  return (
    <details className="group w-full max-w-(--agent-bubble-width) rounded-lg border border-rule bg-paper text-caption text-ink-2">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-3 py-2 text-caption-strong hover:bg-desk focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cta [&::-webkit-details-marker]:hidden">
        <ChevronDown aria-hidden="true" size={14} className="shrink-0 group-open:rotate-180" />
        Como decidi
      </summary>
      <dl className="flex flex-col gap-3 border-t border-rule px-3 py-3">
        {trace.understood ? (
          <div>
            <dt className="text-caption-strong text-ink">O que entendi</dt>
            <dd className="mt-1 wrap-anywhere whitespace-pre-line">{trace.understood}</dd>
          </div>
        ) : null}
        {actions.length > 0 ? (
          <div>
            <dt className="text-caption-strong text-ink">Ação tomada</dt>
            <dd className="mt-1">
              <ul className="flex flex-col gap-1.5">
                {actions.map((action, index) => (
                  <li key={`${action.tool}:${index}`} className="wrap-anywhere whitespace-pre-line">
                    <span className="font-medium">{ACTION_STATUS[action.status]}: </span>
                    {action.summary}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
        {trace.confidence ? (
          <div>
            <dt className="text-caption-strong text-ink">Grau de segurança</dt>
            <dd className="mt-1">{CONFIDENCE[trace.confidence]}</dd>
          </div>
        ) : null}
        {trace.reason ? (
          <div>
            <dt className="text-caption-strong text-ink">Justificativa</dt>
            <dd className="mt-1 wrap-anywhere whitespace-pre-line">{trace.reason}</dd>
          </div>
        ) : null}
      </dl>
    </details>
  );
}
