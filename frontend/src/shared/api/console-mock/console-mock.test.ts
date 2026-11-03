// PROVISÓRIO: remover quando o backend expuser /console (ver plano do console)
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError } from "../api-error";
import { buildConsoleFixtures } from "./fixtures";
import { handleMockRequest } from "./handlers";
import { resetMockDb } from "./mock-db";
import { mockRequest } from "./mock-request";
import { parseMockScenario, type MockScenario } from "./scenario";

const now = new Date("2026-10-20T10:05:30");
const viewer = { id: "analyst-1", name: "Rafael Lima" };

beforeEach(() => resetMockDb());

describe("parseMockScenario", () => {
  it.each(["slow", "empty", "error", "full", "conflict"])("lê %s", (value) => {
    expect(parseMockScenario(`?mock=${value}&conversation=x`)).toBe(value);
  });

  it("usa default sem parâmetro ou com valor desconhecido", () => {
    expect(parseMockScenario("")).toBe("default");
    expect(parseMockScenario("?mock=xyz")).toBe("default");
  });
});

describe("buildConsoleFixtures", () => {
  it("monta as 7 conversas da tela no cenário default", () => {
    const { conversations } = buildConsoleFixtures(now, "default");
    const waiting = conversations.filter((c) => c.status === "WAITING_ANALYST");

    expect(conversations).toHaveLength(7);
    expect(waiting.map((c) => c.handoffReason).sort()).toEqual([
      "EMPLOYEE_REQUEST",
      "LOW_CONFIDENCE",
      "OVERDUE",
    ]);
    expect(conversations.filter((c) => c.status === "WITH_AGENT")).toHaveLength(
      2,
    );
  });

  it("cobre os 4 motivos e os 4 status no cenário full", () => {
    const { conversations } = buildConsoleFixtures(now, "full");

    expect(
      new Set(conversations.map((c) => c.handoffReason).filter(Boolean)).size,
    ).toBe(4);
    expect(new Set(conversations.map((c) => c.status)).size).toBe(4);
  });

  it("deixa a lista vazia no cenário empty", () => {
    expect(buildConsoleFixtures(now, "empty").conversations).toEqual([]);
  });

  it("grava a SYSTEM de transferência na hora do handoff", () => {
    const { conversations, messages } = buildConsoleFixtures(now, "default");
    const ana = conversations.find((c) => c.id === "mock-conv-ana");
    const system = messages["mock-conv-ana"]?.find(
      (m) => m.authorType === "SYSTEM",
    );

    expect(system?.content).toBe("Transferida para um analista");
    expect(system?.createdAt).toBe(ana?.handoffAt);
  });
});

describe("handleMockRequest", () => {
  const request = (
    method: "GET" | "POST",
    path: string,
    scenario: MockScenario = "default",
  ) => handleMockRequest({ method, path, context: { viewer }, now, scenario });

  it("lista e detalha conversas", () => {
    expect(request("GET", "/console/conversations").status).toBe(200);
    expect(
      request("GET", "/console/conversations/mock-conv-ana"),
    ).toMatchObject({
      status: 200,
      body: { conversation: { id: "mock-conv-ana" } },
    });
  });

  it("responde 404 para conversa ou rota desconhecida", () => {
    expect(request("GET", "/console/conversations/nada")).toMatchObject({
      status: 404,
      body: { error: { code: "CONVERSATION_NOT_FOUND" } },
    });
    expect(request("GET", "/console/xyz")).toMatchObject({
      status: 404,
      body: { error: { code: "NOT_FOUND" } },
    });
  });

  it("assumir passa a WITH_ANALYST e grava a SYSTEM", () => {
    const result = request(
      "POST",
      "/console/conversations/mock-conv-ana/takeover",
    );

    expect(result).toMatchObject({
      status: 200,
      body: {
        conversation: {
          status: "WITH_ANALYST",
          analyst: viewer,
          assignedToMe: true,
          handoffReason: "OVERDUE",
        },
      },
    });
    const messages = request(
      "GET",
      "/console/conversations/mock-conv-ana/messages",
    );
    const body = messages.body as {
      messages: { content: string; createdAt: string }[];
    };
    expect(body.messages.at(-1)).toMatchObject({
      content: "Rafael assumiu a conversa",
      createdAt: now.toISOString(),
    });
  });

  it("assumir de novo responde 409", () => {
    request("POST", "/console/conversations/mock-conv-ana/takeover");
    expect(
      request("POST", "/console/conversations/mock-conv-ana/takeover"),
    ).toMatchObject({
      status: 409,
      body: { error: { code: "CONVERSATION_NOT_WAITING" } },
    });
  });

  it("devolver ao agent vale na espera e na própria conversa assumida", () => {
    expect(
      request("POST", "/console/conversations/mock-conv-carla/return"),
    ).toMatchObject({
      status: 200,
      body: {
        conversation: {
          status: "WITH_AGENT",
          analyst: null,
          assignedToMe: false,
        },
      },
    });
    request("POST", "/console/conversations/mock-conv-ana/takeover");
    expect(
      request("POST", "/console/conversations/mock-conv-ana/return").status,
    ).toBe(200);
    expect(
      request("POST", "/console/conversations/mock-conv-diego/return").status,
    ).toBe(409);
  });

  it("no cenário conflict, as ações respondem 409", () => {
    expect(
      request(
        "POST",
        "/console/conversations/mock-conv-ana/takeover",
        "conflict",
      ).status,
    ).toBe(409);
  });
});

describe("mockRequest", () => {
  beforeEach(() => vi.useFakeTimers({ now }));
  afterEach(() => vi.useRealTimers());

  const settle = async <T>(promise: Promise<T>) => {
    const caught = promise.catch((error: unknown) => error);
    await vi.runAllTimersAsync();
    return caught;
  };

  it("valida a resposta com o schema", async () => {
    const result = await settle(
      mockRequest("/console/conversations", {
        schema: z.object({ conversations: z.array(z.unknown()) }),
      }),
    );
    expect(result).toMatchObject({ conversations: expect.any(Array) });
  });

  it("transforma resposta fora do schema em invalid-response", async () => {
    const error = await settle(
      mockRequest("/console/conversations", {
        schema: z.object({ x: z.string() }),
      }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: "invalid-response" });
  });

  it("transforma 409 em ApiError http com code", async () => {
    const error = await settle(
      mockRequest(
        "/console/conversations/mock-conv-ana/takeover",
        { method: "POST", schema: z.unknown(), mockContext: { viewer } },
        "conflict",
      ),
    );
    expect(error).toMatchObject({
      kind: "http",
      status: 409,
      code: "CONVERSATION_NOT_WAITING",
    });
  });

  it("lança unavailable no cenário error", async () => {
    const error = await settle(
      mockRequest("/console/conversations", { schema: z.unknown() }, "error"),
    );
    expect(error).toMatchObject({ kind: "unavailable" });
  });
});
