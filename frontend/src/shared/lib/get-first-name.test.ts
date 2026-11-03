import { describe, expect, it } from "vitest";
import { getFirstName } from "./get-first-name";

describe("getFirstName", () => {
  it("devolve a primeira palavra, sem espaços", () => {
    expect(getFirstName("  Ana  Souza ")).toBe("Ana");
    expect(getFirstName("Rafael")).toBe("Rafael");
  });
});
