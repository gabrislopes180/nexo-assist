import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { PrismaClient } from "../generated/prisma/client.js";
import { createTestDatabase } from "../db/test-database.js";
import { createAuthService, EmailNotFoundError, type AuthService } from "./auth-service.js";

describe("AuthService", () => {
  let client: PrismaClient;
  let service: AuthService;
  let userId: string;

  before(async () => {
    client = await createTestDatabase();
    service = createAuthService(client);
    const user = await client.user.create({
      data: { name: "Pessoa Teste", email: "pessoa@teste.example", role: "ANALYST", department: "TI" },
    });
    userId = user.id;
  });

  after(async () => {
    await client.$disconnect();
  });

  it("login devolve exatamente os campos de SessionUser", async () => {
    assert.deepEqual(await service.login("pessoa@teste.example"), {
      id: userId,
      name: "Pessoa Teste",
      email: "pessoa@teste.example",
      role: "ANALYST",
      department: "TI",
    });
  });

  it("login lança EmailNotFoundError para e-mail inexistente", async () => {
    await assert.rejects(service.login("ninguem@teste.example"), EmailNotFoundError);
  });

  it("findSessionUser devolve exatamente os campos de SessionUser", async () => {
    assert.deepEqual(await service.findSessionUser(userId), {
      id: userId,
      name: "Pessoa Teste",
      email: "pessoa@teste.example",
      role: "ANALYST",
      department: "TI",
    });
  });

  it("findSessionUser devolve null para usuário inexistente", async () => {
    assert.equal(await service.findSessionUser("id-inexistente"), null);
  });

  it("devolve department null quando o usuário não tem departamento", async () => {
    await client.user.create({ data: { name: "Sem Depto", email: "sem-depto@teste.example", role: "EMPLOYEE" } });
    const user = await service.login("sem-depto@teste.example");
    assert.equal(user.department, null);
  });
});
