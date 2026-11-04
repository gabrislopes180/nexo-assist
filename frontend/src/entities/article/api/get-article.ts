import { apiRequest } from "@/shared/api/http-client";
import { articleResponseSchema, type Article } from "../model/article";

/** `GET /help/articles/:slug`: qualquer papel com sessão. */
export function getArticle(slug: string): Promise<Article> {
  return apiRequest(`/help/articles/${encodeURIComponent(slug)}`, {
    schema: articleResponseSchema,
  });
}
