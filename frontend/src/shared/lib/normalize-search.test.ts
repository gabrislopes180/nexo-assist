import { describe, expect, it } from "vitest";
import { normalizeSearch } from "./normalize-search";

describe("normalizeSearch", () => {
  it("tira acentos, caixa e espaços das pontas", () => {
    expect(normalizeSearch("  João ÁVILA ")).toBe("joao avila");
    expect(normalizeSearch("INC-20311")).toBe("inc-20311");
  });
});
