import { getFirstName } from "@/shared/lib/get-first-name";
import type {
  ConsoleConversation,
  HandoffReason,
} from "../model/console-conversation";

/** Motivo na tag da lista ("Transferida · pediu um analista"). */
export const HANDOFF_REASON_SHORT: Record<
  Exclude<HandoffReason, "LOW_CONFIDENCE">,
  string
> = {
  EMPLOYEE_REQUEST: "pediu um analista",
  CRITICAL: "chamado crítico",
  OVERDUE: "prazo vencido",
};

/** Motivo na barra de atendimento ("Agent pausado · prazo vencido"). */
export const HANDOFF_REASON_LONG: Record<HandoffReason, string> = {
  EMPLOYEE_REQUEST: "pediu um analista",
  CRITICAL: "chamado crítico",
  OVERDUE: "prazo vencido",
  LOW_CONFIDENCE: "agent pediu ajuda",
};

export function takeoverBarText(c: ConsoleConversation) {
  return {
    title: `${getFirstName(c.owner.name)} espera um atendente`,
    detail: c.handoffReason
      ? `Agent pausado · ${HANDOFF_REASON_LONG[c.handoffReason]}`
      : "Agent pausado",
  };
}
