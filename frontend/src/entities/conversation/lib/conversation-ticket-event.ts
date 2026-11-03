import { formatTime } from "@/shared/lib/format-date";
import type { ConsoleConversation } from "../model/console-conversation";

export interface ConversationTicketEvent {
  icon: "transfer" | "headset";
  text: string;
  time: string | null;
}

/** Rodapé do card "Desta conversa". O modelo não guarda a hora de assumir. */
export function conversationTicketEvent(
  c: ConsoleConversation,
): ConversationTicketEvent | null {
  if (c.status === "WAITING_ANALYST" && c.handoffAt) {
    return {
      icon: "transfer",
      text: "Transferido para um analista",
      time: formatTime(c.handoffAt),
    };
  }
  if (c.status === "WITH_ANALYST" && c.analyst) {
    return {
      icon: "headset",
      text: `Assumido por ${c.analyst.name}`,
      time: null,
    };
  }
  return null;
}
