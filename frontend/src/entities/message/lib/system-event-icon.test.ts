import { describe, expect, it } from "vitest";
import { systemEventIcon } from "./system-event-icon";

describe("systemEventIcon", () => {
  it.each([
    ["HANDOFF", "transfer"],
    ["TAKEOVER", "takeover"],
    ["RETURNED", "return"],
    ["CLOSED", null],
    [null, null],
  ] as const)("%s → %s", (systemKind, icon) => {
    expect(systemEventIcon(systemKind)).toBe(icon);
  });
});
