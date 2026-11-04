import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import { createApp } from "../app.js";
import { createAuthService } from "../auth/auth-service.js";
import { issueSessionToken } from "../auth/session-token.js";
import { createTestDatabase } from "../db/test-database.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { createKnowledgeService, createPrismaKnowledgeStore, type KnowledgeStore } from "../knowledge/knowledge-service.js";
import { createEventBus } from "../realtime/event-bus.js";
import type { ArticleResponse } from "../shared/knowledge.js";
import type { ApiConfig } from "./config.js";
import { unusedChatService, unusedConsoleService, unusedConsoleTicketService } from "./test-support.js";

const SECRET = "segredo-de-teste-com-mais-de-32-caracteres";
const config: ApiConfig = { sessionSecret: SECRET, corsOrigins: ["http://localhost:3000"], isProduction: false };
const FAST = { timeoutMs: 50, attempts: 2, retryDelayMs: 1 };
const LONG_CONTENT = `Reinstale o cliente de VPN. ${"Passo. ".repeat(400)}`;

describe("GET /help/articles/:slug", () => {
  let client: PrismaClient;
  let server: Server;
  let url: string;
  let employee: string;
  let analyst: string;
  let down = false;
  let findCalls: string[] = [];

  const cookieOf = async (userId: string) => `nexo_session=${await issueSessionToken({ userId, secret: SECRET, now: new Date() })}`;
  const get = (path: string, cookie?: string) => fetch(`${url}${path}`, cookie ? { headers: { Cookie: cookie } } : {});

  async function assertError(res: Response, status: number, code: string, message?: string) {
    assert.equal(res.status, status);
    const { error } = (await res.json()) as { error: { code: string; message: string } };
    assert.equal(error.code, code);
    if (message !== undefined) assert.equal(error.message, message);
  }

  before(async () => {
    client = await createTestDatabase();
    employee = await cookieOf((await client.user.create({ data: { name: "Ana", email: "ana@teste.example", role: "EMPLOYEE" } })).id);
    analyst = await cookieOf((await client.user.create({ data: { name: "Bruno", email: "bruno@teste.example", role: "ANALYST" } })).id);
    await client.article.create({
      data: {
        slug: "vpn-erro-809",
        title: "VPN com erro 809",
        content: LONG_CONTENT,
        category: "NETWORK_VPN",
        keywords: "vpn, erro 809",
        searchText: "vpn com erro 809",
        updatedAt: new Date("2026-10-01T10:00:00.000Z"),
      },
    });
    const real = createPrismaKnowledgeStore(client);
    const store: KnowledgeStore = {
      listArticles: () => real.listArticles(),
      findArticle: (slug) => (findCalls.push(slug), down ? Promise.reject(new Error("banco fora")) : real.findArticle(slug)),
    };
    server = createApp({
      eventBus: createEventBus(),
      config,
      authService: createAuthService(client),
      chatService: unusedChatService,
      consoleService: unusedConsoleService,
      consoleTicketService: unusedConsoleTicketService,
      knowledgeService: createKnowledgeService(store, FAST),
    }).listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    down = false;
    findCalls = [];
  });

  after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await client.$disconnect();
  });

  it("devolve o artigo completo, sem corte, para funcionário e analista", async () => {
    for (const cookie of [employee, analyst]) {
      const res = await get("/help/articles/vpn-erro-809", cookie);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("cache-control"), "no-store");
      const { article } = (await res.json()) as ArticleResponse;
      assert.deepEqual(article, {
        slug: "vpn-erro-809",
        title: "VPN com erro 809",
        category: "NETWORK_VPN",
        content: LONG_CONTENT,
        updatedAt: "2026-10-01T10:00:00.000Z",
      });
    }
  });

  it("401 sem sessão, sem consultar a base", async () => {
    await assertError(await get("/help/articles/vpn-erro-809"), 401, "SESSION_MISSING");
    assert.deepEqual(findCalls, []);
  });

  it("401 SESSION_INVALID com cookie inválido", async () => {
    await assertError(await get("/help/articles/vpn-erro-809", "nexo_session=lixo"), 401, "SESSION_INVALID");
    assert.deepEqual(findCalls, []);
  });

  it("404 ARTICLE_NOT_FOUND para slug inexistente", async () => {
    await assertError(await get("/help/articles/nao-existe", employee), 404, "ARTICLE_NOT_FOUND", "Artigo não encontrado.");
  });

  it("slug fora do formato também é 404, sem consultar a base", async () => {
    for (const slug of ["VPN-ERRO-809", "vpn_erro", "a".repeat(81), "vpn%20erro"]) {
      await assertError(await get(`/help/articles/${slug}`, employee), 404, "ARTICLE_NOT_FOUND");
    }
    assert.deepEqual(findCalls, []);
  });

  it("503 HELP_CENTER_UNAVAILABLE com a base fora do ar, depois de tentar de novo", async () => {
    down = true;
    await assertError(
      await get("/help/articles/vpn-erro-809", employee),
      503,
      "HELP_CENTER_UNAVAILABLE",
      "A central de ajuda está indisponível no momento. Tente novamente em instantes.",
    );
    assert.equal(findCalls.length, 2);
  });
});
