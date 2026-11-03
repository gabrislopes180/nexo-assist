import { getFirstName } from "@/shared/lib/get-first-name";
import type { StatusTone } from "@/shared/ui/status-badge";
import type {
  AgentConfidence,
  ConsoleConversation,
} from "../model/console-conversation";
import { HANDOFF_REASON_SHORT } from "./handoff-text";

export type ConversationTagTone = StatusTone | "resolved";

const CONFIDENCE_LABELS: Record<AgentConfidence, string> = {
  HIGH: "alta",
  MEDIUM: "média",
  LOW: "baixa",
};

export function conversationTag(c: ConsoleConversation): {
  tone: ConversationTagTone;
  label: string;
} {
  switch (c.status) {
    case "WAITING_ANALYST": {
      if (c.handoffReason === "LOW_CONFIDENCE") {
        return {
          tone: "warning",
          label: c.lastAgentConfidence
            ? `Agent pediu ajuda · confiança ${CONFIDENCE_LABELS[c.lastAgentConfidence]}`
            : "Agent pediu ajuda",
        };
      }
      const detail =
        c.ticketCode ??
        (c.handoffReason && HANDOFF_REASON_SHORT[c.handoffReason]);
      return {
        tone: "danger",
        label: detail ? `Transferida · ${detail}` : "Transferida",
      };
    }
    case "WITH_ANALYST":
      return {
        tone: "info",
        label: c.assignedToMe
          ? "Você está atendendo"
          : `Com ${getFirstName(c.analyst?.name ?? "analista")}`,
      };
    case "WITH_AGENT":
      return { tone: "success", label: "Agent atendendo" };
    case "CLOSED":
      return {
        tone: "resolved",
        label: c.analyst
          ? `Encerrada por ${getFirstName(c.analyst.name)}`
          : "Resolvida pelo agent",
      };
  }
}
