import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("mantém o estilo de texto do design system junto da cor", () => {
    expect(cn("text-heading text-on-ink")).toBe("text-heading text-on-ink");
  });

  it("resolve conflito entre dois estilos de texto", () => {
    expect(cn("text-heading", "text-label")).toBe("text-label");
  });

  it("resolve conflito entre duas cores de texto", () => {
    expect(cn("text-ink", "text-ink-3")).toBe("text-ink-3");
  });
});
