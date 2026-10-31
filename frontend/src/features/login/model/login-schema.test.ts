import { describe, expect, it } from "vitest";
import { loginFormSchema } from "./login-schema";

function emailIssue(email: string) {
  const result = loginFormSchema.safeParse({
    email,
    password: "x",
    keepConnected: true,
  });
  return result.error?.issues[0]?.message;
}

describe("loginFormSchema", () => {
  it("normaliza o e-mail", () => {
    const parsed = loginFormSchema.parse({
      email: "  Ana.Souza@NEXO.example ",
      password: "x",
      keepConnected: false,
    });

    expect(parsed.email).toBe("ana.souza@nexo.example");
  });

  it("exige e-mail", () => {
    expect(emailIssue("   ")).toBe("Informe seu e-mail.");
  });

  it("recusa e-mail inválido", () => {
    expect(emailIssue("ana")).toBe(
      "Use um e-mail válido, como nome@nexo.com.br.",
    );
  });

  it("recusa e-mail longo", () => {
    expect(emailIssue(`${"a".repeat(250)}@nexo.com`)).toBe(
      "Use um e-mail com até 254 caracteres.",
    );
  });

  it("exige senha", () => {
    const result = loginFormSchema.safeParse({
      email: "a@nexo.com",
      password: "",
      keepConnected: true,
    });

    expect(result.error?.issues[0]?.message).toBe("Informe sua senha.");
  });
});
