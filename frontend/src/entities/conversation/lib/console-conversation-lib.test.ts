import { describe, expect, it } from "vitest";
import { ApiError } from "@/shared/api/api-error";
import { buildConsoleFixtures } from "@/shared/api/console-mock";
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

const now = new Date("2026-10-20T10:05:30");
const list = consoleConversationListResponseSchema.parse(
  buildConsoleFixtures(now, "default"),
).conversations;
const full = consoleConversationListResponseSchema.parse(
  buildConsoleFixtures(now, "full"),
).conversations;
const byId = (id: string, source = list) => {
  const found = source.find((c) => c.id === id);
  if (!found) throw new Error(id);
  return found;
};
const ana = byId("mock-conv-ana");

describe("schemas do console", () => {
  it("aceitam os fixtures de todos os cenários", () => {
    expect(full.length).toBeGreaterThan(list.length);
  });

  it("recusam status desconhecido e data fora de ISO", () => {
    const base = buildConsoleFixtures(now, "default").conversations[0];
    expect(
      consoleConversationListResponseSchema.safeParse({
        conversations: [{ ...base, status: "PAUSED" }],
      }).success,
    ).toBe(false);
    expect(
      consoleConversationListResponseSchema.safeParse({
        conversations: [{ ...base, lastMessageAt: "ontem" }],
      }).success,
    ).toBe(false);
  });
});

describe("filtros e busca", () => {
  it("ordena esperando primeiro e depois por última mensagem", () => {
    expect(
      sortConversations(list).map((c) => c.owner.name.split(" ")[0]),
    ).toEqual(["Ana", "Carla", "Bruno", "Diego", "Elisa", "Fábio", "Gabriela"]);
  });

  it("conta por filtro", () => {
    expect(filterCounts(list)).toEqual({
      waiting: 3,
      "with-agent": 2,
      mine: 0,
    });
    expect(filterCounts(full).mine).toBe(1);
  });

  it("filtra por status e por minhas", () => {
    expect(visibleConversations(list, "waiting", "")).toHaveLength(3);
    expect(visibleConversations(full, "mine", "").map((c) => c.id)).toEqual([
      "mock-conv-marina",
    ]);
  });

  it("busca sem acento por nome ou chamado", () => {
    expect(matchesSearch(byId("mock-conv-fabio"), "fabio")).toBe(true);
    expect(matchesSearch(ana, "inc-20311")).toBe(true);
    expect(matchesSearch(ana, "joao")).toBe(false);
    expect(matchesSearch(ana, "  ")).toBe(true);
  });
});

describe("rótulos", () => {
  it.each([
    ["mock-conv-ana", list, "danger", "Transferida · INC-20311"],
    ["mock-conv-carla", list, "danger", "Transferida · pediu um analista"],
    ["mock-conv-bruno", list, "warning", "Agent pediu ajuda · confiança baixa"],
    ["mock-conv-diego", list, "success", "Agent atendendo"],
    ["mock-conv-fabio", list, "resolved", "Resolvida pelo agent"],
    ["mock-conv-juliana", full, "danger", "Transferida · INC-20410"],
    ["mock-conv-marina", full, "info", "Você está atendendo"],
    ["mock-conv-rafael", full, "info", "Com Bruno"],
    ["mock-conv-otto", full, "resolved", "Encerrada por Bruno"],
  ])("tag de %s", (id, source, tone, label) => {
    expect(conversationTag(byId(id, source))).toEqual({ tone, label });
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
    expect(conversationPreview(byId("mock-conv-marina", full))).toBe(
      "Você: Oi, Marina. Já estou olhando o seu notebook.",
    );
    expect(conversationPreview(byId("mock-conv-rafael", full))).toBe(
      "Bruno: Vou renovar agora.",
    );
    expect(conversationPreview({ ...ana, lastMessage: null })).toBe("");
  });

  it("pill de status", () => {
    expect(conversationStatusPill(ana)).toEqual({
      tone: "warning",
      label: "Aguardando atendente",
      icon: "bot",
    });
    expect(conversationStatusPill(byId("mock-conv-rafael", full)).label).toBe(
      "Com Bruno",
    );
    expect(conversationStatusPill(byId("mock-conv-fabio")).label).toBe(
      "Encerrada",
    );
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
      time: "10:05",
    });
    expect(conversationTicketEvent(byId("mock-conv-marina", full))).toEqual({
      icon: "headset",
      text: "Assumido por Rafael Lima",
      time: null,
    });
    expect(conversationTicketEvent(byId("mock-conv-diego"))).toBeNull();
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

  it("marca sessão expirada e usa texto por ação no resto", () => {
    expect(
      consoleActionFailure(http(401, "SESSION_INVALID"), "takeover"),
    ).toMatchObject({
      sessionExpired: true,
    });
    expect(consoleActionFailure(new Error("x"), "takeover").message).toBe(
      "Não foi possível assumir o atendimento. Tente de novo.",
    );
    expect(
      consoleActionFailure(http(500, "INTERNAL_ERROR"), "return").message,
    ).toBe("Não foi possível devolver ao agent. Tente de novo.");
  });
});
