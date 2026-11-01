import { describe, expect, it } from "vitest";
import {
  chatMessageSchema,
  chatResponseSchema,
  parseChatMessage,
} from "./chat-schema";

const response = {
  conversation: {
    id: "c1",
    status: "WITH_AGENT",
    messageCount: 1,
    messageLimit: 30,
    remainingMessages: 29,
  },
  message: {
    id: "m1",
    authorType: "AGENT",
    content: "Olá",
    createdAt: "2026-10-16T17:20:00.000Z",
    trace: {
      understood: "x",
      intent: "y",
      confidence: 0.9,
      reason: "z",
      actions: [
        { tool: "searchMyOpenTickets", summary: "s", status: "SUCCESS" },
      ],
    },
  },
  ticketLookup: null,
};

describe("chatMessageSchema", () => {
  it("remove NUL antes de validar", () => {
    expect(chatMessageSchema.parse("a\0b")).toBe("ab");
  });

  it("recusa texto só com NUL ou espaço", () => {
    expect(chatMessageSchema.safeParse("\0 \0").success).toBe(false);
    expect(chatMessageSchema.safeParse("   ").success).toBe(false);
  });

  it("aceita os limites de 1 e 2000 caracteres", () => {
    expect(chatMessageSchema.safeParse("a").success).toBe(true);
    expect(chatMessageSchema.safeParse("a".repeat(2000)).success).toBe(true);
  });

  it("recusa 2001 caracteres, mas conta depois de limpar", () => {
    expect(chatMessageSchema.safeParse("a".repeat(2001)).success).toBe(false);
    expect(
      chatMessageSchema.safeParse(`${"a".repeat(2000)}  `).success,
    ).toBe(true);
  });
});

describe("parseChatMessage", () => {
  it("devolve o texto limpo quando é válido", () => {
    expect(parseChatMessage("  oi\0  ")).toEqual({
      status: "ok",
      message: "oi",
    });
  });

  it("classifica texto vazio", () => {
    expect(parseChatMessage(" \0 ").status).toBe("empty");
  });

  it("classifica texto acima do limite", () => {
    expect(parseChatMessage("a".repeat(2001)).status).toBe("too-long");
  });
});

describe("chatResponseSchema", () => {
  it("aceita resposta sem consulta", () => {
    expect(chatResponseSchema.parse(response).ticketLookup).toBeNull();
  });

  it("descarta os campos do trace que a UI não consome", () => {
    const parsed = chatResponseSchema.parse(response);

    expect(parsed.message.trace).toEqual({
      actions: response.message.trace.actions,
    });
    expect(parsed.message).not.toHaveProperty("authorType");
  });

  it("aceita resposta com consulta", () => {
    const parsed = chatResponseSchema.parse({
      ...response,
      ticketLookup: {
        outcome: "NO_MATCH",
        openTicketCount: 2,
        totalMatches: 0,
        tickets: [],
      },
    });

    expect(parsed.ticketLookup?.outcome).toBe("NO_MATCH");
  });

  it("recusa status de conversa desconhecido", () => {
    const invalid = {
      ...response,
      conversation: { ...response.conversation, status: "PAUSED" },
    };

    expect(chatResponseSchema.safeParse(invalid).success).toBe(false);
  });

  it("recusa status de ação desconhecido", () => {
    const invalid = structuredClone(response);
    invalid.message.trace.actions[0]!.status = "RUNNING";

    expect(chatResponseSchema.safeParse(invalid).success).toBe(false);
  });
});
