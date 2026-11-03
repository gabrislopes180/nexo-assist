import { describe, expect, it } from "vitest";
import { systemEventIcon } from "./system-event-icon";

describe("systemEventIcon", () => {
  it.each([
    ["Transferida para um analista", "transfer"],
    ["Rafael assumiu a conversa", "takeover"],
    ["Maria Clara assumiu a conversa", "takeover"],
    ["Conversa devolvida ao agent", null],
    ["Rafael encerrou o atendimento", null],
    ["texto novo do backend", null],
  ] as const)("%s → %s", (content, icon) => {
    expect(systemEventIcon(content)).toBe(icon);
  });
});
