import { describe, expect, it } from "vitest";
import {
  chatMessageSchema,
  chatResponseSchema,
  confirmDraftResponseSchema,
  parseChatMessage,
} from "./chat-schema";

const response = {
  conversation: {
    id: "c1",
    status: "WITH_AGENT",
    messageCount: 1,
    messageLimit: 30,
    remainingMessages: 29,
    analyst: null,
  },
  employeeMessage: {
    id: "e1",
    authorType: "EMPLOYEE",
    content: "Oi",
    createdAt: "2026-10-16T17:19:59.000Z",
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
  it("traz a mensagem gravada do funcionário", () => {
    expect(chatResponseSchema.parse(response).employeeMessage).toEqual(
      response.employeeMessage,
    );
  });

  it("aceita resposta sem mensagem do agent quando um analista atende", () => {
    const parsed = chatResponseSchema.parse({
      ...response,
      conversation: {
        ...response.conversation,
        status: "WITH_ANALYST",
        analyst: { id: "a1", name: "Rafael Lima" },
      },
      message: null,
    });

    expect(parsed.message).toBeNull();
    expect(parsed.conversation.analyst?.name).toBe("Rafael Lima");
  });

  it("recusa resposta sem employeeMessage", () => {
    const rest: Record<string, unknown> = { ...response };
    delete rest.employeeMessage;
    expect(chatResponseSchema.safeParse(rest).success).toBe(false);
  });

  it("aceita resposta sem consulta", () => {
    expect(chatResponseSchema.parse(response).ticketLookup).toBeNull();
  });

  it("descarta os campos do trace que a UI não consome", () => {
    const parsed = chatResponseSchema.parse(response);

    expect(parsed.message?.trace).toEqual({
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

  it("aceita rascunho e respostas rápidas", () => {
    const parsed = chatResponseSchema.parse({
      ...response,
      ticketDraft: {
        id: "d1",
        kind: "CREATE",
        type: "INC",
        category: "NETWORK_VPN",
        priority: "HIGH",
        title: "VPN",
        description: "Erro 809.",
        affectedScope: "INDIVIDUAL",
        dueAtPreview: "2026-10-20T16:43:00.000Z",
      },
      quickReplies: ["Só eu", "Minha equipe"],
    });

    expect(parsed.ticketDraft?.kind).toBe("CREATE");
    expect(parsed.quickReplies).toEqual(["Só eu", "Minha equipe"]);
  });

  it("trata rascunho e respostas rápidas ausentes como null", () => {
    const parsed = chatResponseSchema.parse(response);

    expect(parsed.ticketDraft).toBeNull();
    expect(parsed.quickReplies).toBeNull();
  });

  it("ignora respostas rápidas fora do formato e remove repetidas", () => {
    expect(
      chatResponseSchema.parse({ ...response, quickReplies: ["", 3] }).quickReplies,
    ).toBeNull();
    expect(
      chatResponseSchema.parse({ ...response, quickReplies: ["Só eu", "Só eu"] })
        .quickReplies,
    ).toEqual(["Só eu"]);
  });

  it("aceita a conversa na resposta da confirmação", () => {
    const parsed = confirmDraftResponseSchema.parse({
      message: response.message,
      ticket: {
        code: "INC-1",
        type: "INC",
        category: "ACCESS",
        priority: "CRITICAL",
        status: "WAITING_ANALYST",
        statusLabel: "Aguardando analista",
        title: "Sem acesso",
        createdAt: "2026-10-20T12:00:00.000Z",
        dueAt: null,
        overdue: false,
      },
      conversation: { id: "c1", status: "WAITING_ANALYST" },
    });

    expect(parsed.conversation).toEqual({ id: "c1", status: "WAITING_ANALYST" });
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
