import { describe, expect, it } from "vitest";
import {
  parseConversationParam,
  resolveSelectedConversationId,
} from "./selected-conversation";

describe("parseConversationParam", () => {
  it("aceita um id curto e descarta o resto", () => {
    expect(parseConversationParam(" mock-conv-ana ")).toBe("mock-conv-ana");
    expect(parseConversationParam("")).toBeNull();
    expect(parseConversationParam(null)).toBeNull();
    expect(parseConversationParam("x".repeat(65))).toBeNull();
  });
});

describe("resolveSelectedConversationId", () => {
  const visibleIds = ["a", "b"];

  it("respeita o parâmetro, mesmo fora do filtro", () => {
    expect(
      resolveSelectedConversationId({ param: "z", visibleIds, isWide: true }),
    ).toBe("z");
  });

  it("sem parâmetro, abre o primeiro só na tela larga", () => {
    expect(
      resolveSelectedConversationId({ param: null, visibleIds, isWide: true }),
    ).toBe("a");
    expect(
      resolveSelectedConversationId({ param: null, visibleIds, isWide: false }),
    ).toBeNull();
    expect(
      resolveSelectedConversationId({
        param: null,
        visibleIds: [],
        isWide: true,
      }),
    ).toBeNull();
  });
});
