import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TicketCategory } from "../generated/prisma/enums.js";
import { ARTICLES } from "../db/seed-data/articles.js";
import {
  ARTICLE_CONTENT_LIMIT,
  MAX_HELP_ARTICLES,
  rankArticles,
  scoreArticle,
  type RankableArticle,
} from "./article-search.js";
import { normalizeSearchText } from "./search-text.js";

/** Mesmo `searchText` que o seed grava. */
function article(slug: string, fields: { title?: string; keywords?: string[]; content?: string; category?: TicketCategory } = {}): RankableArticle {
  const title = fields.title ?? `Artigo ${slug}`;
  const keywords = fields.keywords ?? [];
  const content = fields.content ?? "Conteúdo neutro.";
  return {
    slug,
    title,
    category: fields.category ?? "OTHER",
    content,
    keywords,
    searchText: normalizeSearchText(`${title} ${keywords.join(", ")} ${content}`),
  };
}

const slugs = (articles: readonly { slug: string }[]) => articles.map(({ slug }) => slug);

describe("scoreArticle", () => {
  it("keyword do artigo igual vale 3", () => {
    assert.deepEqual(scoreArticle(article("a", { keywords: ["vpn"] }), ["vpn"]), { score: 3, matched: 1 });
  });

  it("keyword do artigo que contém a buscada como frase vale 3", () => {
    assert.equal(scoreArticle(article("a", { keywords: ["erro 809"] }), ["809"]).score, 3);
  });

  it("só no título vale 2 e só no texto vale 1", () => {
    assert.equal(scoreArticle(article("a", { title: "Impressora travada" }), ["impressora"]).score, 2);
    assert.equal(scoreArticle(article("a", { content: "Use a impressora do andar." }), ["impressora"]).score, 1);
  });

  it("vale o maior casamento da keyword, sem somar keyword, título e texto", () => {
    const everywhere = article("a", { title: "VPN", keywords: ["vpn"], content: "VPN caiu." });
    assert.deepEqual(scoreArticle(everywhere, ["vpn"]), { score: 3, matched: 1 });
  });

  it("soma entre keywords diferentes", () => {
    assert.deepEqual(scoreArticle(article("a", { title: "VPN", keywords: ["809"] }), ["vpn", "809"]), { score: 5, matched: 2 });
  });

  it("casa por fronteira de palavra: rede não casa redefinir", () => {
    const redefinir = article("a", { title: "Redefinir acesso", keywords: ["redefinir"], content: "Redefinir pelo portal." });
    assert.deepEqual(scoreArticle(redefinir, ["rede"]), { score: 0, matched: 0 });
    assert.equal(scoreArticle(article("b", { keywords: ["rede"] }), ["rede"]).score, 3);
  });

  it("keyword do artigo dentro de uma palavra maior também não casa", () => {
    assert.equal(scoreArticle(article("a", { keywords: ["redefinir senha"] }), ["rede"]).score, 0);
  });

  it("categoria igual dá 1 de bônus", () => {
    const vpn = article("a", { title: "VPN lenta", category: "NETWORK_VPN" });
    assert.equal(scoreArticle(vpn, ["vpn"], "NETWORK_VPN").score, 3);
    assert.equal(scoreArticle(vpn, ["vpn"], "EMAIL").score, 2);
  });

  it("ignora acentos e maiúsculas dos dois lados", () => {
    assert.equal(scoreArticle(article("a", { keywords: ["Horário"] }), ["horario"]).score, 3);
    assert.equal(scoreArticle(article("a", { title: "Conexão ruim" }), ["CONEXAO"]).score, 2);
  });
});

describe("rankArticles", () => {
  const vpn = article("vpn", { keywords: ["vpn"], category: "NETWORK_VPN" });

  it("sem keyword significativa não devolve nada, nem tudo", () => {
    const articles = [article("a", { keywords: ["erro"] }), vpn];
    assert.deepEqual(rankArticles(articles, { keywords: ["erro"] }), []);
    assert.deepEqual(rankArticles(articles, { keywords: ["nao funciona", "  "] }), []);
  });

  it("keyword genérica junto com uma significativa não pontua", () => {
    const generic = article("generico", { keywords: ["problema"], title: "Problema" });
    assert.deepEqual(slugs(rankArticles([generic, vpn], { keywords: ["problema", "vpn"] })), ["vpn"]);
  });

  it("corta abaixo de 3 pontos", () => {
    const titleOnly = article("titulo", { title: "Impressora" }); // 2
    const textTwice = article("texto", { content: "Impressora com fila presa." }); // 1 + 1
    const titleAndText = article("ambos", { title: "Impressora", content: "Fila presa." }); // 2 + 1
    assert.deepEqual(slugs(rankArticles([titleOnly, textTwice, titleAndText], { keywords: ["impressora", "fila"] })), ["ambos"]);
  });

  it("categoria é bônus, não filtro", () => {
    const titleOnly = article("titulo", { title: "Impressora", category: "HARDWARE" });
    assert.deepEqual(slugs(rankArticles([titleOnly], { keywords: ["impressora"], category: "HARDWARE" })), ["titulo"]);
    assert.deepEqual(slugs(rankArticles([vpn], { keywords: ["vpn"], category: "EMAIL" })), ["vpn"]);
  });

  it("ordena por pontuação", () => {
    const strong = article("z-forte", { keywords: ["vpn", "809"] });
    assert.deepEqual(slugs(rankArticles([vpn, strong], { keywords: ["vpn", "809"] })), ["z-forte", "vpn"]);
  });

  it("empate na pontuação: mais keywords casadas primeiro", () => {
    // 3 (uma keyword) contra 2 + 1 (duas keywords).
    const one = article("a-uma", { keywords: ["vpn"] });
    const two = article("b-duas", { title: "VPN", content: "Cliente 809." });
    assert.deepEqual(slugs(rankArticles([one, two], { keywords: ["vpn", "809"] })), ["b-duas", "a-uma"]);
  });

  it("empate total: slug em ordem alfabética", () => {
    const b = article("b", { keywords: ["vpn"] });
    const a = article("a", { keywords: ["vpn"] });
    assert.deepEqual(slugs(rankArticles([b, a], { keywords: ["vpn"] })), ["a", "b"]);
  });

  it(`devolve no máximo ${MAX_HELP_ARTICLES}`, () => {
    const many = ["e", "d", "c", "b", "a"].map((slug) => article(slug, { keywords: ["vpn"] }));
    assert.deepEqual(slugs(rankArticles(many, { keywords: ["vpn"] })), ["a", "b", "c"]);
  });

  it("devolve só slug, título, categoria e conteúdo, com o conteúdo cortado", () => {
    const long = article("longo", { keywords: ["vpn"], content: "x".repeat(ARTICLE_CONTENT_LIMIT + 50), category: "NETWORK_VPN" });
    const [found] = rankArticles([long], { keywords: ["vpn"] });
    assert.deepEqual(Object.keys(found ?? {}).sort(), ["category", "content", "slug", "title"]);
    assert.equal(found?.content.length, ARTICLE_CONTENT_LIMIT);
    assert.equal(found?.category, "NETWORK_VPN");
  });

  it("keyword repetida conta uma vez", () => {
    const [found] = rankArticles([vpn], { keywords: ["VPN", "vpn"] });
    assert.equal(found?.slug, "vpn");
    assert.deepEqual(scoreArticle(vpn, ["VPN", "vpn"]), { score: 3, matched: 1 });
  });
});

describe("rankArticles sobre os artigos do seed", () => {
  const seeded: RankableArticle[] = ARTICLES.map((a) =>
    article(a.slug, { title: a.title, keywords: a.keywords.map((k) => k.toLowerCase()), content: a.content, category: a.category }),
  );

  it("VPN com erro 809 no Windows 10 traz vpn-erro-809 primeiro, com a condição do Windows no conteúdo", () => {
    const [first] = rankArticles(seeded, { keywords: ["vpn", "erro 809", "windows 10"], category: "NETWORK_VPN" });
    assert.equal(first?.slug, "vpn-erro-809");
    assert.match(first?.content ?? "", /apenas para Windows 10; no Windows 11, abra um chamado/);
  });

  it("no Windows 11 a busca também traz vpn-erro-809 (o artigo diz para abrir chamado)", () => {
    const [first] = rankArticles(seeded, { keywords: ["vpn", "809", "windows 11"] });
    assert.equal(first?.slug, "vpn-erro-809");
  });

  it("horário do suporte traz horario-service-desk", () => {
    const found = rankArticles(seeded, { keywords: ["horário", "suporte"] });
    assert.deepEqual(slugs(found), ["horario-service-desk"]);
  });

  it("rede não casa o artigo de redefinir pela palavra redefinir", () => {
    const found = rankArticles(seeded, { keywords: ["rede"] });
    assert.deepEqual(slugs(found), ["redefinir-senha-rede"]);
    assert.equal(scoreArticle(seeded.find(({ slug }) => slug === "redefinir-senha-rede") ?? article("ausente"), ["redef"]).score, 0);
  });

  it("assunto sem artigo não traz nada", () => {
    assert.deepEqual(rankArticles(seeded, { keywords: ["teclado", "monitor"] }), []);
  });
});
