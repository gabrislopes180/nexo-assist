import type { ConsoleConversation } from "@/entities/conversation";
import { getFirstName } from "@/shared/lib/get-first-name";

export type FooterState =
  | { kind: "takeover" }
  | { kind: "reply" }
  | { kind: "locked"; text: string };

export function footerState(c: ConsoleConversation): FooterState {
  switch (c.status) {
    case "WAITING_ANALYST":
      return { kind: "takeover" };
    case "WITH_AGENT":
      return {
        kind: "locked",
        text: "O Nexo Assist está atendendo esta conversa",
      };
    case "WITH_ANALYST":
      return c.assignedToMe
        ? { kind: "reply" }
        : {
            kind: "locked",
            text: `${getFirstName(c.analyst?.name ?? "Outro analista")} está atendendo esta conversa`,
          };
    case "CLOSED":
      return { kind: "locked", text: "Conversa encerrada" };
  }
}
