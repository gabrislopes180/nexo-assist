import { describe, expect, it } from "vitest";
import { timelineMessageSchema } from "./timeline-message";

const agent = {
  id: "m1",
  authorType: "AGENT",
  author: null,
  content: "Olá",
  createdAt: "2026-11-03T10:00:00.000Z",
  trace: {
    understood: "x",
    intent: "y",
    confidence: "HIGH",
    reason: "z",
    actions: [{ tool: "searchMyOpenTickets", summary: "s", status: "SUCCESS" }],
  },
};

describe("timelineMessageSchema", () => {
  it("guarda as ações do trace", () => {
    expect(timelineMessageSchema.parse(agent).trace?.actions).toHaveLength(1);
  });

  it("trace inválido vira null sem derrubar a mensagem", () => {
    const parsed = timelineMessageSchema.parse({ ...agent, trace: { foo: 1 } });
    expect(parsed.trace).toBeNull();
    expect(parsed.content).toBe("Olá");
  });

  it("aceita trace ausente ou null", () => {
    const rest: Record<string, unknown> = { ...agent };
    delete rest.trace;
    expect(timelineMessageSchema.parse(rest).trace ?? null).toBeNull();
    expect(timelineMessageSchema.parse({ ...agent, trace: null }).trace).toBeNull();
  });

  it("aceita analista com autor e recusa autor desconhecido", () => {
    expect(
      timelineMessageSchema.parse({
        ...agent,
        authorType: "ANALYST",
        author: { id: "a1", name: "Rafael Lima" },
        trace: null,
      }).author,
    ).toEqual({ id: "a1", name: "Rafael Lima" });
    expect(
      timelineMessageSchema.safeParse({ ...agent, authorType: "BOT" }).success,
    ).toBe(false);
  });
});
