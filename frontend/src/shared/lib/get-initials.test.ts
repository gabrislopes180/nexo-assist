import { describe, expect, it } from "vitest";
import { getInitials } from "./get-initials";

describe("getInitials", () => {
  it("usa o primeiro e o último nome", () => {
    expect(getInitials("Ana Souza")).toBe("AS");
    expect(getInitials("Ana de Souza Lima")).toBe("AL");
  });

  it("usa duas letras quando há um só nome", () => {
    expect(getInitials("Ana")).toBe("AN");
  });

  it("ignora espaços extras e deixa em maiúsculas", () => {
    expect(getInitials("  ana   souza ")).toBe("AS");
  });

  it("mantém acentos", () => {
    expect(getInitials("Érica Ávila")).toBe("ÉÁ");
  });

  it("devolve texto vazio para nome vazio", () => {
    expect(getInitials("   ")).toBe("");
  });
});
