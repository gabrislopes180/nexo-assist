import { describe, expect, it } from "vitest";
import { homePathFor } from "./home-path";

describe("homePathFor", () => {
  it("leva o funcionário ao atendimento", () => {
    expect(homePathFor("EMPLOYEE")).toBe("/console/employee");
  });

  it("leva o analista ao perfil", () => {
    expect(homePathFor("ANALYST")).toBe("/profile");
  });
});
