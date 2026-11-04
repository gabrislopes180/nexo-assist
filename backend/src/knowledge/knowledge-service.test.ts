import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createTestDatabase } from "../db/test-database.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { ArticleView } from "../shared/knowledge.js";
import type { RankableArticle } from "./article-search.js";
import {
  ArticleNotFoundError,
  createKnowledgeService,
  createPrismaKnowledgeStore,
  KnowledgeUnavailableError,
  type KnowledgeStore,
} from "./knowledge-service.js";
import { normalizeSearchText } from "./search-text.js";

const FAST = { timeoutMs: 20, attempts: 2, retryDelayMs: 1 };

const VPN: RankableArticle = {
  slug: "vpn-erro-809",
  title: "VPN com erro 809",
  category: "NETWORK_VPN",
  content: "Reinstale o cliente.",
  keywords: ["vpn", "erro 809"],
  searchText: normalizeSearchText("VPN com erro 809 vpn, erro 809 Reinstale o cliente."),
};
const VIEW: ArticleView = { slug: VPN.slug, title: VPN.title, category: VPN.category, content: VPN.content, updatedAt: "2026-11-01T12:00:00.000Z" };

function fakeStore(overrides: Partial<KnowledgeStore> = {}) {
  const calls = { list: 0, find: [] as string[] };
  const store: KnowledgeStore = {
    listArticles: () => (calls.list++, Promise.resolve([VPN])),
    findArticle: (slug) => (calls.find.push(slug), Promise.resolve(slug === VPN.slug ? VIEW : null)),
    ...overrides,
  };
  return { store, calls };
}

const hangs = () => new Promise<never>(() => undefined);

describe("KnowledgeService.searchArticles", () => {
  it("ranqueia os artigos da base", async () => {
    const { store } = fakeStore();
    const found = await createKnowledgeService(store, FAST).searchArticles({ keywords: ["VPN"] });
    assert.deepEqual(found, [{ slug: VPN.slug, title: VPN.title, category: VPN.category, content: VPN.content }]);
  });

  it("sem keyword significativa não consulta a base", async () => {
    const { store, calls } = fakeStore();
    assert.deepEqual(await createKnowledgeService(store, FAST).searchArticles({ keywords: ["erro"] }), []);
    assert.equal(calls.list, 0);
  });

  it("tenta de novo depois de uma falha", async () => {
    let calls = 0;
    const { store } = fakeStore({ listArticles: () => (++calls === 1 ? Promise.reject(new Error("x")) : Promise.resolve([VPN])) });
    assert.equal((await createKnowledgeService(store, FAST).searchArticles({ keywords: ["vpn"] })).length, 1);
    assert.equal(calls, 2);
  });

  it("falha ou timeout em todas as tentativas vira KnowledgeUnavailableError sem detalhe", async () => {
    const failing = fakeStore({ listArticles: () => Promise.reject(new Error("detalhe interno")) });
    await assert.rejects(
      createKnowledgeService(failing.store, FAST).searchArticles({ keywords: ["vpn"] }),
      (error: Error) => error instanceof KnowledgeUnavailableError && !error.message.includes("detalhe"),
    );
    const hanging = fakeStore({ listArticles: hangs });
    await assert.rejects(createKnowledgeService(hanging.store, FAST).searchArticles({ keywords: ["vpn"] }), KnowledgeUnavailableError);
  });
});

describe("KnowledgeService.getArticle", () => {
  it("devolve o artigo completo", async () => {
    const { store } = fakeStore();
    assert.deepEqual(await createKnowledgeService(store, FAST).getArticle("vpn-erro-809"), VIEW);
  });

  it("artigo inexistente é ArticleNotFoundError, sem nova tentativa", async () => {
    const { store, calls } = fakeStore();
    await assert.rejects(createKnowledgeService(store, FAST).getArticle("nao-existe"), ArticleNotFoundError);
    assert.deepEqual(calls.find, ["nao-existe"]);
  });

  it("slug fora do formato é ArticleNotFoundError sem consultar a base", async () => {
    const { store, calls } = fakeStore();
    for (const slug of ["", "VPN", "a/b", "a".repeat(81), "vpn erro"]) {
      await assert.rejects(createKnowledgeService(store, FAST).getArticle(slug), ArticleNotFoundError);
    }
    assert.deepEqual(calls.find, []);
  });

  it("base fora do ar vira KnowledgeUnavailableError", async () => {
    const { store } = fakeStore({ findArticle: () => Promise.reject(new Error("x")) });
    await assert.rejects(createKnowledgeService(store, FAST).getArticle("vpn-erro-809"), KnowledgeUnavailableError);
  });
});

describe("createPrismaKnowledgeStore", () => {
  let client: PrismaClient;
  const updatedAt = new Date("2026-10-01T10:00:00.000Z");

  before(async () => {
    client = await createTestDatabase();
    await client.article.create({
      data: {
        slug: "vpn-erro-809",
        title: "VPN com erro 809",
        content: "Reinstale o cliente.",
        category: "NETWORK_VPN",
        keywords: "vpn, erro 809, conexão",
        searchText: "vpn com erro 809 vpn, erro 809, conexao reinstale o cliente.",
        updatedAt,
      },
    });
  });

  after(async () => {
    await client.$disconnect();
  });

  it("lista os artigos com as keywords separadas", async () => {
    const [article] = await createPrismaKnowledgeStore(client).listArticles();
    assert.deepEqual(article, {
      slug: "vpn-erro-809",
      title: "VPN com erro 809",
      category: "NETWORK_VPN",
      content: "Reinstale o cliente.",
      keywords: ["vpn", "erro 809", "conexão"],
      searchText: "vpn com erro 809 vpn, erro 809, conexao reinstale o cliente.",
    });
  });

  it("busca por slug com updatedAt em ISO, ou null", async () => {
    const store = createPrismaKnowledgeStore(client);
    const article = await store.findArticle("vpn-erro-809");
    assert.equal(article?.updatedAt, updatedAt.toISOString());
    assert.equal(article?.content, "Reinstale o cliente.");
    assert.equal(await store.findArticle("outro"), null);
  });

  it("de ponta a ponta com o serviço", async () => {
    const service = createKnowledgeService(createPrismaKnowledgeStore(client), FAST);
    assert.deepEqual(
      (await service.searchArticles({ keywords: ["Conexão"], category: "NETWORK_VPN" })).map(({ slug }) => slug),
      ["vpn-erro-809"],
    );
  });
});
