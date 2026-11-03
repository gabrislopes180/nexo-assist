import { describe, expect, it } from "vitest";
import { consoleConversationSchema } from "./console-conversation";
import { conversationSchema } from "./conversation";

const chatConversation = {
  id: "c1",
  status: "WITH_ANALYST",
  messageCount: 3,
  messageLimit: 30,
  remainingMessages: 27,
  analyst: { id: "a1", name: "Rafael Lima" },
};

const consoleConversation = {
  id: "c1",
  status: "WITH_ANALYST",
  owner: { id: "e1", name: "Ana Souza", department: "Financeiro" },
  analyst: { id: "a1", name: "Rafael Lima" },
  assignedToMe: true,
  assignedAt: "2026-11-03T10:12:00.000Z",
  handoffReason: "EMPLOYEE_REQUEST",
  handoffSummary: "Pediu um analista.",
  handoffAt: "2026-11-03T10:05:00.000Z",
  lastMessageAt: "2026-11-03T10:12:00.000Z",
  closedAt: null,
  messageCount: 4,
  messageLimit: 30,
  lastMessage: null,
  lastAgentConfidence: null,
  ticketCode: null,
};

describe("conversationSchema", () => {
  it("traz o analista que atende, ou null", () => {
    expect(conversationSchema.parse(chatConversation).analyst).toEqual({
      id: "a1",
      name: "Rafael Lima",
    });
    expect(
      conversationSchema.parse({ ...chatConversation, analyst: null }).analyst,
    ).toBeNull();
  });

  it("recusa conversa sem o campo analyst", () => {
    const rest: Record<string, unknown> = { ...chatConversation };
    delete rest.analyst;
    expect(conversationSchema.safeParse(rest).success).toBe(false);
  });
});

describe("consoleConversationSchema", () => {
  it("aceita assignedAt, messageCount e messageLimit", () => {
    expect(consoleConversationSchema.parse(consoleConversation)).toMatchObject({
      assignedAt: "2026-11-03T10:12:00.000Z",
      messageCount: 4,
      messageLimit: 30,
    });
  });

  it.each(["assignedAt", "messageCount", "messageLimit"])(
    "exige %s",
    (field) => {
      const copy: Record<string, unknown> = { ...consoleConversation };
      delete copy[field];
      expect(consoleConversationSchema.safeParse(copy).success).toBe(false);
    },
  );
});
