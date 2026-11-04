import type { PrismaClient } from "../generated/prisma/client.js";
import { ARTICLE_SLUG_PATTERN, type ArticleView, type HelpArticle, type HelpCenterSearchInput } from "../shared/knowledge.js";
import { withRetry, type ResilienceOptions } from "../shared/resilience.js";
import { rankArticles, significantKeywords, type RankableArticle } from "./article-search.js";

export class ArticleNotFoundError extends Error {
  constructor() {
    super("Artigo não encontrado");
    this.name = "ArticleNotFoundError";
  }
}

/** A base de artigos não respondeu depois das tentativas. */
export class KnowledgeUnavailableError extends Error {
  constructor() {
    super("Central de ajuda indisponível");
    this.name = "KnowledgeUnavailableError";
  }
}

/** Interface usada pela tool do agent e pela rota `GET /help/articles/:slug`. */
export type KnowledgeService = {
  /**
   * Até 3 artigos (conteúdo cortado em 2000). Vazio = nenhum artigo. Lança KnowledgeUnavailableError.
   * Não valida: quem chama (a tool) faz o parse com `helpCenterSearchInputSchema` antes.
   */
  searchArticles(input: HelpCenterSearchInput): Promise<HelpArticle[]>;
  /** Artigo completo. Lança ArticleNotFoundError (inclusive slug fora do formato) ou KnowledgeUnavailableError. */
  getArticle(slug: string): Promise<ArticleView>;
};

/** Acesso cru à base, sem retry. */
export type KnowledgeStore = {
  listArticles(): Promise<RankableArticle[]>;
  findArticle(slug: string): Promise<ArticleView | null>;
};

const DEFAULT_RESILIENCE: ResilienceOptions = { timeoutMs: 2000, attempts: 2, retryDelayMs: 100 };

const unavailable = () => new KnowledgeUnavailableError();

/** `Article.keywords` é gravado separado por vírgula. */
function splitKeywords(keywords: string): string[] {
  return keywords
    .split(",")
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword !== "");
}

export function createPrismaKnowledgeStore(client: Pick<PrismaClient, "article">): KnowledgeStore {
  return {
    async listArticles() {
      const rows = await client.article.findMany({
        select: { slug: true, title: true, category: true, content: true, keywords: true, searchText: true },
        orderBy: { slug: "asc" },
      });
      return rows.map((row) => ({ ...row, keywords: splitKeywords(row.keywords) }));
    },
    async findArticle(slug) {
      const row = await client.article.findUnique({
        where: { slug },
        select: { slug: true, title: true, category: true, content: true, updatedAt: true },
      });
      return row ? { ...row, updatedAt: row.updatedAt.toISOString() } : null;
    },
  };
}

/** Leitura com timeout (2 s) e 2 tentativas; "não encontrado" não é falha e não repete. */
export function createKnowledgeService(store: KnowledgeStore, options: ResilienceOptions = DEFAULT_RESILIENCE): KnowledgeService {
  return {
    async searchArticles(input) {
      if (significantKeywords(input.keywords).length === 0) return [];
      const articles = await withRetry(() => store.listArticles(), options, unavailable);
      return rankArticles(articles, input);
    },
    async getArticle(slug) {
      if (!ARTICLE_SLUG_PATTERN.test(slug)) throw new ArticleNotFoundError();
      const article = await withRetry(() => store.findArticle(slug), options, unavailable);
      if (!article) throw new ArticleNotFoundError();
      return article;
    },
  };
}
