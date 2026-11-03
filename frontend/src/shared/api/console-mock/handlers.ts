// PROVISÓRIO: remover quando o backend expuser /console (ver plano do console)
import { getFirstName } from "@/shared/lib/get-first-name";
import type { MockConversation, MockPerson, MockState } from "./fixtures";
import { mockDb } from "./mock-db";
import type { MockScenario } from "./scenario";

export interface MockContext {
  viewer: MockPerson;
}

interface MockRequestInput {
  method: "GET" | "POST";
  path: string;
  context?: MockContext;
  now: Date;
  scenario: MockScenario;
}

export interface MockResponse {
  status: number;
  body: unknown;
}

const ok = (body: unknown): MockResponse => ({ status: 200, body });
const fail = (status: number, code: string, message: string): MockResponse => ({
  status,
  body: { error: { code, message } },
});

const NOT_WAITING = () =>
  fail(
    409,
    "CONVERSATION_NOT_WAITING",
    "A conversa não está esperando atendente.",
  );

function addSystem(
  state: MockState,
  conversation: MockConversation,
  content: string,
  now: Date,
) {
  const messages = state.messages[conversation.id] ?? [];
  messages.push({
    id: `mock-msg-${conversation.id}-${messages.length + 1}`,
    authorType: "SYSTEM",
    author: null,
    content,
    createdAt: now.toISOString(),
  });
  state.messages[conversation.id] = messages;
  conversation.lastMessageAt = now.toISOString();
}

function takeover(
  state: MockState,
  conversation: MockConversation,
  viewer: MockPerson,
  now: Date,
) {
  if (conversation.status !== "WAITING_ANALYST") return NOT_WAITING();
  conversation.status = "WITH_ANALYST";
  conversation.analyst = viewer;
  conversation.assignedToMe = true;
  addSystem(
    state,
    conversation,
    `${getFirstName(viewer.name)} assumiu a conversa`,
    now,
  );
  return ok({ conversation });
}

function giveBack(state: MockState, conversation: MockConversation, now: Date) {
  const allowed =
    conversation.status === "WAITING_ANALYST" ||
    (conversation.status === "WITH_ANALYST" && conversation.assignedToMe);
  if (!allowed) return NOT_WAITING();
  conversation.status = "WITH_AGENT";
  conversation.analyst = null;
  conversation.assignedToMe = false;
  addSystem(state, conversation, "Conversa devolvida ao agent", now);
  return ok({ conversation });
}

export function handleMockRequest({
  method,
  path,
  context,
  now,
  scenario,
}: MockRequestInput): MockResponse {
  const state = mockDb(scenario, now);
  const [root, resource, rawId, action, ...rest] = path
    .split("/")
    .filter(Boolean);
  if (root !== "console" || resource !== "conversations" || rest.length > 0) {
    return fail(404, "NOT_FOUND", "Rota não encontrada.");
  }
  if (rawId === undefined) {
    return method === "GET"
      ? ok({ conversations: state.conversations })
      : fail(404, "NOT_FOUND", "Rota não encontrada.");
  }

  const id = decodeURIComponent(rawId);
  const conversation = state.conversations.find(
    (candidate) => candidate.id === id,
  );
  if (!conversation)
    return fail(404, "CONVERSATION_NOT_FOUND", "Conversa não encontrada.");

  if (method === "GET") {
    if (action === undefined) return ok({ conversation });
    if (action === "messages")
      return ok({ messages: state.messages[id] ?? [] });
    if (action === "tickets")
      return ok(
        state.tickets[id] ?? { conversationTicket: null, otherTickets: [] },
      );
  }
  if (method === "POST" && (action === "takeover" || action === "return")) {
    if (!context)
      throw new Error("mockContext.viewer é obrigatório nas ações do console.");
    if (scenario === "conflict") return NOT_WAITING();
    return action === "takeover"
      ? takeover(state, conversation, context.viewer, now)
      : giveBack(state, conversation, now);
  }
  return fail(404, "NOT_FOUND", "Rota não encontrada.");
}
