import { describe, expect, it } from "vitest";
import { ApiError } from "@/shared/api/api-error";
import { formatTime } from "@/shared/lib/format-date";
import {
  consoleConversationListResponseSchema,
  type ConsoleConversation,
} from "../model/console-conversation";
import { consoleActionFailure } from "./console-action-error";
import {
  filterCounts,
  matchesSearch,
  sortConversations,
  visibleConversations,
} from "./conversation-filters";
import { conversationPreview } from "./conversation-preview";
import { conversationStatusPill } from "./conversation-status-pill";
import { conversationTag } from "./conversation-tag";
import { conversationTicketEvent } from "./conversation-ticket-event";
import { takeoverBarText } from "./handoff-text";
import { buildConsoleConversation as build } from "./test-fixtures";

const rafael = { id: "a-rafael", name: "Rafael Lima" };
const bruno = { id: "a-bruno", name: "Bruno Martins" };
const owner = (id: string, name: string) => ({ id, name, department: null });

const ana = build();
const carla = build({
  id: "c-carla",
  owner: owner("u-carla", "Carla Mendes"),
  handoffReason: "EMPLOYEE_REQUEST",
  ticketCode: null,
  lastMessageAt: "2026-10-20T12:58:05.000Z",
  lastMessage: {
    authorType: "EMPLOYEE",
    content: "Preciso de acesso ao SAP ainda hoje",
    createdAt: "2026-10-20T12:58:00.000Z",
  },
});
const bruna = build({
  id: "c-bruna",
  owner: owner("u-bruna", "Bruna Tavares"),
  handoffReason: "LOW_CONFIDENCE",
  lastAgentConfidence: "LOW",
  ticketCode: null,
  lastMessageAt: "2026-10-20T12:51:00.000Z",
});
const diego = build({
  id: "c-diego",
  status: "WITH_AGENT",
  owner: owner("u-diego", "Diego Ramos"),
  handoffReason: null,
  handoffAt: null,
  ticketCode: null,
  lastMessageAt: "2026-10-20T13:06:00.000Z",
});
const fabio = build({
  id: "c-fabio",
  status: "CLOSED",
  owner: owner("u-fabio", "Fábio Nunes"),
  handoffReason: null,
  handoffAt: null,
  ticketCode: null,
  closedAt: "2026-10-20T13:01:00.000Z",
  lastMessageAt: "2026-10-20T13:01:00.000Z",
});
const marina = build({
  id: "c-marina",
  status: "WITH_ANALYST",
  owner: owner("u-marina", "Marina Costa"),
  analyst: rafael,
  assignedToMe: true,
  assignedAt: "2026-10-20T13:12:00.000Z",
  lastMessageAt: "2026-10-20T12:00:00.000Z",
  lastMessage: {
    authorType: "ANALYST",
    content: "Oi, Marina. Já estou olhando o seu notebook.",
    createdAt: "2026-10-20T12:00:00.000Z",
  },
});
const otto = build({
  id: "c-otto",
  status: "WITH_ANALYST",
  owner: owner("u-otto", "Otto Lima"),
  analyst: bruno,
  assignedAt: "2026-10-20T11:00:00.000Z",
  lastMessageAt: "2026-10-20T11:30:00.000Z",
  lastMessage: {
    authorType: "ANALYST",
    content: "Vou renovar agora.",
    createdAt: "2026-10-20T11:30:00.000Z",
  },
});
const closedByBruno = build({
  id: "c-closed",
  status: "CLOSED",
  owner: owner("u-paula", "Paula Reis"),
  analyst: bruno,
  closedAt: "2026-10-20T10:00:00.000Z",
  lastMessageAt: "2026-10-20T10:00:00.000Z",
});
const list = [diego, fabio, carla, ana, bruna, marina, otto, closedByBruno];

describe("schemas do console", () => {
  it("aceitam a conversa completa", () => {
    expect(
      consoleConversationListResponseSchema.parse({ conversations: list })
        .conversations,
    ).toHaveLength(list.length);
  });

  it("recusam status desconhecido e data fora de ISO", () => {
    expect(
      consoleConversationListResponseSchema.safeParse({
        conversations: [{ ...ana, status: "PAUSED" }],
      }).success,
    ).toBe(false);
    expect(
      consoleConversationListResponseSchema.safeParse({
        conversations: [{ ...ana, lastMessageAt: "ontem" }],
      }).success,
    ).toBe(false);
  });
});

describe("filtros e busca", () => {
  it("ordena quem pede ação primeiro e depois por última mensagem", () => {
    expect(sortConversations(list).map((c) => c.id)).toEqual([
      "c-ana",
      "c-carla",
      "c-bruna",
      "c-marina",
      "c-diego",
      "c-fabio",
      "c-otto",
      "c-closed",
    ]);
  });

  it("conta por filtro", () => {
    expect(filterCounts(list)).toEqual({
      waiting: 3,
      "with-agent": 1,
      mine: 1,
    });
  });

  it("filtra por status e por minhas", () => {
    expect(visibleConversations(list, "waiting", "")).toHaveLength(3);
    expect(visibleConversations(list, "mine", "").map((c) => c.id)).toEqual([
      "c-marina",
    ]);
  });

  it("busca sem acento por nome ou chamado", () => {
    expect(matchesSearch(fabio, "fabio")).toBe(true);
    expect(matchesSearch(ana, "inc-20311")).toBe(true);
    expect(matchesSearch(ana, "joao")).toBe(false);
    expect(matchesSearch(ana, "  ")).toBe(true);
  });
});

describe("rótulos", () => {
  it.each([
    [ana, "danger", "Transferida · INC-20311"],
    [carla, "danger", "Transferida · pediu um analista"],
    [bruna, "warning", "Agent pediu ajuda · confiança baixa"],
    [diego, "success", "Agent atendendo"],
    [fabio, "resolved", "Resolvida pelo agent"],
    [marina, "info", "Você está atendendo"],
    [otto, "info", "Com Bruno"],
    [closedByBruno, "resolved", "Encerrada por Bruno"],
  ] as const)("tag %#", (conversation, tone, label) => {
    expect(conversationTag(conversation)).toEqual({ tone, label });
  });

  it("tag sem motivo ou sem confiança", () => {
    const base: ConsoleConversation = { ...ana, ticketCode: null };
    expect(conversationTag({ ...base, handoffReason: null }).label).toBe(
      "Transferida",
    );
    expect(
      conversationTag({
        ...base,
        handoffReason: "LOW_CONFIDENCE",
        lastAgentConfidence: null,
      }).label,
    ).toBe("Agent pediu ajuda");
  });

  it("prévia por autor", () => {
    expect(conversationPreview(ana)).toBe(
      "Nexo: Encaminhei para o Suporte N2. Um analista vai falar com você em até 2 h úteis.",
    );
    expect(conversationPreview(marina)).toBe(
      "Você: Oi, Marina. Já estou olhando o seu notebook.",
    );
    expect(conversationPreview(otto)).toBe("Bruno: Vou renovar agora.");
    expect(conversationPreview({ ...ana, lastMessage: null })).toBe("");
  });

  it("pill de status", () => {
    expect(conversationStatusPill(ana)).toEqual({
      tone: "warning",
      label: "Aguardando atendente",
      icon: "bot",
    });
    expect(conversationStatusPill(otto).label).toBe("Com Bruno");
    expect(conversationStatusPill(fabio).label).toBe("Encerrada");
  });

  it("texto da barra de atendimento", () => {
    expect(takeoverBarText(ana)).toEqual({
      title: "Ana espera um atendente",
      detail: "Agent pausado · prazo vencido",
    });
    expect(takeoverBarText({ ...ana, handoffReason: null }).detail).toBe(
      "Agent pausado",
    );
  });

  it("evento do chamado da conversa", () => {
    expect(conversationTicketEvent(ana)).toEqual({
      icon: "transfer",
      text: "Transferido para um analista",
      time: formatTime("2026-10-20T13:05:00.001Z"),
    });
    expect(conversationTicketEvent(diego)).toBeNull();
  });

  it("evento de assumido traz a hora de assumir", () => {
    expect(conversationTicketEvent(marina)).toEqual({
      icon: "headset",
      text: "Assumido por Rafael Lima",
      time: formatTime("2026-10-20T13:12:00.000Z"),
    });
    expect(
      conversationTicketEvent({ ...marina, assignedAt: null })?.time,
    ).toBeNull();
  });
});

describe("consoleActionFailure", () => {
  const http = (status: number, code: string) =>
    new ApiError("http", "x", { status, code });

  it("trata conversa que não espera mais e conversa sumida como desatualizadas", () => {
    expect(
      consoleActionFailure(http(409, "CONVERSATION_NOT_WAITING"), "takeover"),
    ).toEqual({
      message: "Esta conversa não está mais esperando atendente.",
      stale: true,
      sessionExpired: false,
    });
    expect(
      consoleActionFailure(http(404, "CONVERSATION_NOT_FOUND"), "return"),
    ).toMatchObject({
      message: "Esta conversa não existe mais.",
      stale: true,
    });
  });

  it("trata conversa que não é mais minha como desatualizada", () => {
    expect(
      consoleActionFailure(http(409, "CONVERSATION_NOT_ASSIGNED"), "reply"),
    ).toEqual({
      message: "Esta conversa não está sendo atendida por você.",
      stale: true,
      sessionExpired: false,
    });
  });

  it("marca sessão expirada e usa texto por ação no resto", () => {
    expect(
      consoleActionFailure(http(401, "SESSION_INVALID"), "takeover"),
    ).toMatchObject({ sessionExpired: true });
    expect(consoleActionFailure(new Error("x"), "takeover").message).toBe(
      "Não foi possível assumir o atendimento. Tente de novo.",
    );
    expect(
      consoleActionFailure(http(500, "INTERNAL_ERROR"), "return").message,
    ).toBe("Não foi possível devolver ao agent. Tente de novo.");
    expect(consoleActionFailure(new Error("x"), "reply").message).toBe(
      "Não foi possível enviar a resposta. Tente de novo.",
    );
    expect(consoleActionFailure(new Error("x"), "close").message).toBe(
      "Não foi possível encerrar o atendimento. Tente de novo.",
    );
  });
});
