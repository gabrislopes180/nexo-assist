import { describe, expect, it } from "vitest";
import { messageCreatedEventSchema } from "./message-events";

const message = {
  id: "s1",
  authorType: "SYSTEM",
  author: null,
  content: "Rafael assumiu a conversa",
  createdAt: "2026-11-03T10:12:00.000Z",
  trace: null,
  systemKind: "TAKEOVER",
};

describe("messageCreatedEventSchema", () => {
  it("lê a conversa e a mensagem do message.created", () => {
    const parsed = messageCreatedEventSchema.parse({ conversationId: "c1", message });
    expect(parsed).toEqual({ conversationId: "c1", message });
  });

  it("recusa evento sem conversa ou com mensagem fora do schema", () => {
    expect(messageCreatedEventSchema.safeParse({ message }).success).toBe(false);
    expect(
      messageCreatedEventSchema.safeParse({
        conversationId: "c1",
        message: { ...message, authorType: "BOT" },
      }).success,
    ).toBe(false);
  });
});
