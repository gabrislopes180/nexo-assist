import { toConversationView } from "../chat/chat-service.js";
import { toConsoleConversation } from "../console/console-service.js";
import { toTimelineMessageView } from "../conversations/timeline.js";
import type { SessionUser } from "../shared/session.js";
import type { BusEvent } from "./event-bus.js";

export type Viewer = Pick<SessionUser, "id" | "role">;

export type SerializedEvent = { id: string; event: BusEvent["type"]; data: unknown };

/** O funcionário só vê as próprias conversas, e o painel de chamados é só do console. */
export function canReceive(viewer: Viewer, event: BusEvent): boolean {
  if (viewer.role === "ANALYST") return true;
  return event.ownerId === viewer.id && event.type !== "tickets.changed";
}

/**
 * A view de cada público, montada na hora de escrever: a mesma conversa vira ChatConversationView
 * para o funcionário e ConsoleConversation (com o assignedToMe de quem lê) para o analista.
 */
export function serializeFor(viewer: Viewer, event: BusEvent): SerializedEvent | null {
  if (!canReceive(viewer, event)) return null;
  const base = { id: event.id, event: event.type };
  switch (event.type) {
    case "message.created":
      return { ...base, data: { conversationId: event.conversationId, message: toTimelineMessageView(event.data) } };
    case "conversation.updated":
      return {
        ...base,
        data: { conversation: viewer.role === "ANALYST" ? toConsoleConversation(event.data, viewer.id) : toConversationView(event.data) },
      };
    case "tickets.changed":
      return { ...base, data: { conversationId: event.conversationId, ownerId: event.ownerId, ticketCode: event.ticketCode } };
  }
}
