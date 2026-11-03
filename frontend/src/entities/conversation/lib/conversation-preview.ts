import { getFirstName } from "@/shared/lib/get-first-name";
import type { ConsoleConversation } from "../model/console-conversation";

/** Prévia da lista: "Nexo: …", "Você: …", "Bruno: …" ou o texto do funcionário. */
export function conversationPreview(c: ConsoleConversation): string {
  const last = c.lastMessage;
  if (!last) return "";

  const text = last.content.replace(/\s*\n\s*/g, " ");
  if (last.authorType === "AGENT") return `Nexo: ${text}`;
  if (last.authorType === "ANALYST") {
    const who = c.assignedToMe
      ? "Você"
      : getFirstName(c.analyst?.name ?? "Analista");
    return `${who}: ${text}`;
  }
  return text;
}
