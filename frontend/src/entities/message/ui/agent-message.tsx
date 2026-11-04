import type { ReactNode } from "react";
import { splitQuestion } from "../lib/split-question";
import type { TrailStep } from "../lib/trail-steps";
import type { AgentTrace } from "../model/message";
import { AgentActions } from "./agent-actions";
import { AgentDecision } from "./agent-decision";

interface AgentMessageProps {
  steps: TrailStep[];
  trace?: AgentTrace | null;
  /** Texto puro: a resposta nunca é interpretada como HTML. */
  children: string;
  /** Dentro da bolha, abaixo do texto: respostas rápidas. */
  replies?: ReactNode;
  /** Abaixo da bolha, antes do anexo: cards dos artigos citados. */
  sources?: ReactNode;
  attachment?: ReactNode;
}

export function AgentMessage({
  steps,
  trace,
  children,
  replies,
  sources,
  attachment,
}: AgentMessageProps) {
  const { text, question } = replies
    ? splitQuestion(children)
    : { text: children, question: null };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-caption">
        <span className="text-caption-strong text-ink">Nexo Assist</span>
        <AgentActions steps={steps} />
      </div>
      <div className="flex w-full max-w-(--agent-bubble-width) flex-col gap-3 rounded-lg rounded-tl-xs border border-rule bg-paper px-4 py-3">
        <p className="text-body leading-normal wrap-anywhere whitespace-pre-line text-ink">
          {text}
        </p>
        {question ? (
          <p className="text-body font-semibold wrap-anywhere text-ink">
            {question}
          </p>
        ) : null}
        {replies}
      </div>
      <AgentDecision trace={trace} />
      {sources}
      {attachment}
    </div>
  );
}
