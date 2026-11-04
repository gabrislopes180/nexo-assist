import { z } from "zod";
import { TicketCategory } from "../generated/prisma/enums.js";

/**
 * Central de ajuda. Entrada e saída da busca (usadas pela tool do agent) e o artigo
 * completo de `GET /help/articles/:slug` (usado pelo card do chat).
 */

export const ARTICLE_SLUG_PATTERN = /^[a-z0-9-]{1,80}$/;

export const helpCenterSearchInputSchema = z.strictObject({
  keywords: z.array(z.string().trim().min(2).max(40)).min(1).max(6),
  category: z.enum(TicketCategory).optional(),
});

export const helpArticleSchema = z.strictObject({
  slug: z.string(),
  title: z.string(),
  category: z.enum(TicketCategory),
  content: z.string(),
});

export const helpCenterSearchResultSchema = z.discriminatedUnion("outcome", [
  z.strictObject({ outcome: z.literal("FOUND"), articles: z.array(helpArticleSchema).min(1).max(3) }),
  z.strictObject({ outcome: z.literal("NO_MATCH"), articles: z.tuple([]) }),
  z.strictObject({ outcome: z.literal("UNAVAILABLE"), articles: z.tuple([]) }),
]);

export type HelpCenterSearchInput = z.infer<typeof helpCenterSearchInputSchema>;
export type HelpArticle = z.infer<typeof helpArticleSchema>;
export type HelpCenterSearchResult = z.infer<typeof helpCenterSearchResultSchema>;

/** Artigo completo (conteúdo sem corte), para o card do chat. */
export type ArticleView = HelpArticle & { updatedAt: string };
export type ArticleResponse = { article: ArticleView };
