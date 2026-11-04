import { describe, expect, it } from "vitest";
import type { ConsoleMessageData } from "../model/console-message";
import { buildConsoleTimeline } from "./console-timeline";

const now = new Date("2026-10-20T10:30:00");
const ana = { id: "u1", name: "Ana Souza" };
const msg = (
  id: string,
  authorType: ConsoleMessageData["authorType"],
  createdAt: string,
  content = "oi",
  systemKind: ConsoleMessageData["systemKind"] = null,
): ConsoleMessageData => ({
  id,
  authorType,
  author:
    authorType === "EMPLOYEE"
      ? ana
      : authorType === "ANALYST"
        ? { id: "a1", name: "Rafael Lima" }
        : null,
  content,
  createdAt,
  systemKind,
});
const build = (messages: ConsoleMessageData[]) =>
  buildConsoleTimeline(messages, { ownerName: "Ana Souza", now });

describe("buildConsoleTimeline", () => {
  it("põe a pílula do dia antes do primeiro item e quando a data muda", () => {
    const items = build([
      msg("1", "EMPLOYEE", "2026-10-19T16:00:00"),
      msg("2", "AGENT", "2026-10-20T10:01:00"),
    ]);
    expect(
      items
        .filter((i) => i.kind === "day")
        .map((i) => i.kind === "day" && i.label),
    ).toEqual(["Ontem", "Hoje"]);
  });

  it("agrupa mensagens seguidas do mesmo autor e esconde o remetente", () => {
    const items = build([
      msg("1", "AGENT", "2026-10-20T10:01:00"),
      msg("2", "EMPLOYEE", "2026-10-20T10:04:00"),
      msg("3", "EMPLOYEE", "2026-10-20T10:04:30"),
    ]).filter((i) => i.kind === "message");

    expect(
      items.map(
        (i) => i.kind === "message" && [i.from, i.grouped, i.showSender],
      ),
    ).toEqual([
      ["agent", false, true],
      ["client", false, false],
      ["client", true, false],
    ]);
    expect(items[0]).toMatchObject({
      senderName: "Nexo Assist",
      time: "10:01",
    });
    expect(items[1]).toMatchObject({ senderName: "Ana Souza" });
  });

  it("marca como longa acima de 64 caracteres ou com quebra de linha", () => {
    const items = build([
      msg("1", "AGENT", "2026-10-20T10:01:00", "a".repeat(65)),
      msg("2", "ANALYST", "2026-10-20T10:02:00", "curta\nsim"),
      msg("3", "AGENT", "2026-10-20T10:03:00", "a".repeat(64)),
    ]).filter((i) => i.kind === "message");
    expect(items.map((i) => i.kind === "message" && i.long)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("mostra SYSTEM como evento com hora e o ícone do systemKind", () => {
    const items = build([
      msg("1", "SYSTEM", "2026-10-20T10:05:00.000Z", "Transferida para um analista", "HANDOFF"),
      msg("2", "SYSTEM", "2026-10-20T10:12:00.000Z", "Rafael assumiu a conversa", "TAKEOVER"),
      msg("3", "SYSTEM", "2026-10-20T10:20:00.000Z", "Conversa devolvida ao agent", "RETURNED"),
      msg("4", "SYSTEM", "2026-10-20T10:25:00.000Z", "Rafael encerrou o atendimento", "CLOSED"),
    ]).filter((i) => i.kind === "event");
    expect(items.map((i) => i.kind === "event" && i.icon)).toEqual([
      "transfer",
      "takeover",
      "return",
      null,
    ]);
    expect(items[0]).toMatchObject({
      label: expect.stringMatching(
        /^Transferida para um analista · \d\d:\d\d$/,
      ),
    });
  });

  it("decide o ícone pelo systemKind, nunca pelo texto", () => {
    const items = build([
      msg("1", "SYSTEM", "2026-10-20T10:05:00.000Z", "Transferida para um analista", null),
      msg("2", "SYSTEM", "2026-10-20T10:06:00.000Z", "Texto novo do backend", "HANDOFF"),
    ]).filter((i) => i.kind === "event");
    expect(items.map((i) => i.kind === "event" && i.icon)).toEqual([
      null,
      "transfer",
    ]);
  });

  it("ordena por data de forma estável", () => {
    const items = build([
      msg("b", "AGENT", "2026-10-20T10:02:00"),
      msg("a", "EMPLOYEE", "2026-10-20T10:01:00"),
      msg("c", "AGENT", "2026-10-20T10:02:00"),
    ]).filter((i) => i.kind === "message");
    expect(items.map((i) => i.key)).toEqual(["a", "b", "c"]);
  });
});
