import type { TicketCategory } from "../generated/prisma/enums.js";
import type { HelpArticle, HelpCenterSearchInput } from "../shared/knowledge.js";
import { isSignificant, normalizedKeywords, normalizeSearchText } from "./search-text.js";

/** Busca da central de ajuda (módulo puro, em memória: a base tem poucos artigos). */

export const MAX_HELP_ARTICLES = 3;
export const MIN_ARTICLE_SCORE = 3;
export const ARTICLE_CONTENT_LIMIT = 2000;

const KEYWORD_POINTS = 3;
const TITLE_POINTS = 2;
const TEXT_POINTS = 1;
const CATEGORY_BONUS = 1;

export type RankableArticle = {
  slug: string;
  title: string;
  category: TicketCategory;
  content: string;
  /** Keywords do artigo, como gravadas (o módulo normaliza). */
  keywords: readonly string[];
  /** Já normalizado pelo seed: título, keywords e conteúdo. */
  searchText: string;
};

export type ArticleScore = { score: number; matched: number };

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `phrase` aparece em `text` com fronteira de palavra dos dois lados ("rede" não casa "redefinir"). */
function containsPhrase(text: string, phrase: string): boolean {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(phrase)}(?![\\p{L}\\p{N}])`, "u").test(text);
}

/** Por keyword vale só o maior casamento: keyword do artigo (3), título (2) ou texto (1). */
function keywordPoints(keyword: string, article: { keywords: readonly string[]; title: string; searchText: string }): number {
  if (article.keywords.some((articleKeyword) => containsPhrase(articleKeyword, keyword))) return KEYWORD_POINTS;
  if (containsPhrase(article.title, keyword)) return TITLE_POINTS;
  if (containsPhrase(article.searchText, keyword)) return TEXT_POINTS;
  return 0;
}

/** Keywords buscadas, normalizadas, sem repetidas e sem as genéricas. */
export function significantKeywords(rawKeywords: readonly string[]): string[] {
  return normalizedKeywords(rawKeywords).filter(isSignificant);
}

function scoreNormalized(article: RankableArticle, keywords: readonly string[], category?: TicketCategory): ArticleScore {
  const normalized = {
    keywords: article.keywords.map(normalizeSearchText),
    title: normalizeSearchText(article.title),
    searchText: normalizeSearchText(article.searchText),
  };
  let score = 0;
  let matched = 0;
  for (const keyword of keywords) {
    const points = keywordPoints(keyword, normalized);
    if (points > 0) matched++;
    score += points;
  }
  if (category !== undefined && article.category === category) score += CATEGORY_BONUS;
  return { score, matched };
}

/** Pontuação de um artigo para as keywords buscadas (normaliza e descarta as genéricas). */
export function scoreArticle(article: RankableArticle, rawKeywords: readonly string[], category?: TicketCategory): ArticleScore {
  return scoreNormalized(article, significantKeywords(rawKeywords), category);
}

function toHelpArticle(article: RankableArticle): HelpArticle {
  return {
    slug: article.slug,
    title: article.title,
    category: article.category,
    content: article.content.slice(0, ARTICLE_CONTENT_LIMIT),
  };
}

/**
 * Até 3 artigos com pontuação mínima 3, por pontuação, keywords casadas e slug.
 * Sem keyword significativa não devolve nada (nunca a base inteira).
 */
export function rankArticles(articles: readonly RankableArticle[], input: HelpCenterSearchInput): HelpArticle[] {
  const keywords = significantKeywords(input.keywords);
  if (keywords.length === 0) return [];
  return articles
    .map((article) => ({ article, ...scoreNormalized(article, keywords, input.category) }))
    .filter(({ score, matched }) => matched > 0 && score >= MIN_ARTICLE_SCORE)
    .sort((a, b) => b.score - a.score || b.matched - a.matched || (a.article.slug < b.article.slug ? -1 : a.article.slug > b.article.slug ? 1 : 0))
    .slice(0, MAX_HELP_ARTICLES)
    .map(({ article }) => toHelpArticle(article));
}
