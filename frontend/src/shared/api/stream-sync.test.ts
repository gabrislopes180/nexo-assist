import { describe, expect, it } from "vitest";
import { isResync } from "./stream-sync";

describe("isResync", () => {
  it("só o RESYNC pede para buscar de novo", () => {
    expect(isResync({ mode: "RESYNC" })).toBe(true);
    expect(isResync({ mode: "REPLAY" })).toBe(false);
  });

  it("sync fora do formato não pede nada", () => {
    expect(isResync({ mode: "OUTRO" })).toBe(false);
    expect(isResync(null)).toBe(false);
  });
});
