import { useQuery } from "@tanstack/react-query";
import { getArticle } from "./get-article";

/** Artigo não muda durante a conversa: sem refazer a busca a cada render. */
const ARTICLE_STALE_MS = 5 * 60_000;

export const articleKeys = {
  detail: (slug: string) => ["help", "article", slug] as const,
};

/**
 * Busca assim que o card aparece: a categoria entra no card fechado e o texto
 * abre sem espera. 401 e 404 não repetem (padrão do QueryClient para 4xx).
 */
export function useArticle(slug: string) {
  return useQuery({
    queryKey: articleKeys.detail(slug),
    queryFn: () => getArticle(slug),
    staleTime: ARTICLE_STALE_MS,
  });
}
