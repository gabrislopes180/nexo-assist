import { describe, expect, it } from "vitest";
import { navItemsFor } from "./nav-items";

describe("navItemsFor", () => {
  it("dá ao funcionário Atendimento e Meu perfil", () => {
    expect(navItemsFor("EMPLOYEE").map(({ label, href }) => [label, href])).toEqual(
      [
        ["Atendimento", "/console/employee"],
        ["Meu perfil", "/profile"],
      ],
    );
  });

  it("dá ao analista só Meu perfil", () => {
    expect(navItemsFor("ANALYST").map(({ href }) => href)).toEqual(["/profile"]);
  });
});
