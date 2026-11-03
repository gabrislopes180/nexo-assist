import { getFirstName } from "@/shared/lib/get-first-name";
import type { StatusTone } from "@/shared/ui/status-badge";
import type { ConsoleConversation } from "../model/console-conversation";

export function conversationStatusPill(c: ConsoleConversation): {
  tone: StatusTone;
  label: string;
  icon: "bot" | null;
} {
  switch (c.status) {
    case "WAITING_ANALYST":
      return { tone: "warning", label: "Aguardando atendente", icon: "bot" };
    case "WITH_AGENT":
      return { tone: "success", label: "Agent atendendo", icon: null };
    case "WITH_ANALYST":
      return {
        tone: "info",
        label: c.assignedToMe
          ? "Você está atendendo"
          : `Com ${getFirstName(c.analyst?.name ?? "analista")}`,
        icon: null,
      };
    case "CLOSED":
      return { tone: "neutral", label: "Encerrada", icon: null };
  }
}
