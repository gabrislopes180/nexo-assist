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
    intent: "CHECK_TICKET",
    confidence: "HIGH",
    reason: "z",
    actions: [{ tool: "searchMyOpenTickets", summary: "s", status: "SUCCESS" }],
  },
};

const system = {
  id: "s1",
  authorType: "SYSTEM",
  author: null,
  content: "Transferida para um analista",
  createdAt: "2026-11-03T10:05:00.000Z",
  trace: null,
  systemKind: "HANDOFF",
};

describe("timelineMessageSchema", () => {
  it("preserva a decisão completa recuperada do histórico", () => {
    expect(timelineMessageSchema.parse(agent).trace).toEqual(agent.trace);
  });

  it("trace inválido vira null sem derrubar a mensagem", () => {
    const parsed = timelineMessageSchema.parse({ ...agent, trace: { foo: 1 } });
    expect(parsed.trace).toBeNull();
    expect(parsed.content).toBe("Olá");
  });

  it("guarda o artigo citado em trace.sources", () => {
    const parsed = timelineMessageSchema.parse({
      ...agent,
      trace: {
        ...agent.trace,
        sources: [
          { kind: "ARTICLE", slug: "vpn-erro-809", title: "VPN com erro 809" },
        ],
      },
    });
    expect(parsed.trace?.sources).toEqual([
      { slug: "vpn-erro-809", title: "VPN com erro 809" },
    ]);
  });

  it("fonte inválida some e a trilha fica", () => {
    const parsed = timelineMessageSchema.parse({
      ...agent,
      trace: { ...agent.trace, sources: "vpn" },
    });
    expect(parsed.trace?.sources).toEqual([]);
    expect(parsed.trace?.actions).toHaveLength(1);
  });

  it("trace antigo, sem sources, fica sem fonte", () => {
    expect(timelineMessageSchema.parse(agent).trace?.sources).toBeUndefined();
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

  it.each(["HANDOFF", "TAKEOVER", "RETURNED", "CLOSED"] as const)(
    "guarda o systemKind %s",
    (systemKind) => {
      const parsed = timelineMessageSchema.parse({
        ...system,
        systemKind,
      });
      expect(parsed.systemKind).toBe(systemKind);
    },
  );

  it("systemKind desconhecido ou ausente vira null sem derrubar a mensagem", () => {
    const rest: Record<string, unknown> = { ...system };
    delete rest.systemKind;
    expect(
      timelineMessageSchema.parse({ ...system, systemKind: "REOPENED" })
        .systemKind,
    ).toBeNull();
    expect(timelineMessageSchema.parse(rest).systemKind).toBeNull();
    expect(timelineMessageSchema.parse({ ...agent, systemKind: null }).systemKind).toBeNull();
  });
});
