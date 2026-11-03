import { describe, expect, it } from "vitest";
import { avatarToneFor } from "./avatar-tone";

describe("avatarToneFor", () => {
  it("é determinístico", () => {
    expect(avatarToneFor("abc")).toBe(avatarToneFor("abc"));
  });

  it.each([
    ["mock-user-ana-5", "blue"],
    ["mock-user-carla-5", "orange"],
    ["mock-user-bruno-6", "violet"],
    ["mock-user-diego-2", "green"],
    ["mock-user-elisa-4", "rose"],
    ["mock-user-gabriela-2", "yellow"],
    ["mock-user-fabio-5", "gray"],
  ])("dá a %s o tom %s da tela", (id, tone) => {
    expect(avatarToneFor(id)).toBe(tone);
  });
});
