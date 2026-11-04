import { z } from "zod";

/** Mesmo formato de slug aceito por `GET /help/articles/:slug`. */
const ARTICLE_SLUG = /^[a-z0-9-]{1,80}$/;
const MAX_SOURCES = 3;

const articleSourceSchema = z.object({
  kind: z.literal("ARTICLE"),
  slug: z.string().regex(ARTICLE_SLUG),
  title: z.string().trim().min(1),
});

/** Artigo da central de ajuda citado numa resposta do agent. */
export interface ArticleSource {
  slug: string;
  title: string;
}

function validSources(items: readonly unknown[]): ArticleSource[] {
  const bySlug = new Map<string, ArticleSource>();
  for (const item of items) {
    const parsed = articleSourceSchema.safeParse(item);
    if (!parsed.success || bySlug.has(parsed.data.slug)) continue;
    bySlug.set(parsed.data.slug, {
      slug: parsed.data.slug,
      title: parsed.data.title,
    });
  }
  return [...bySlug.values()].slice(0, MAX_SOURCES);
}

/**
 * `trace.sources`, lido com tolerância: ausente (traces antigos) fica ausente,
 * tipo desconhecido ou fonte inválida some sem derrubar a mensagem.
 */
export const agentSourcesSchema = z
  .array(z.unknown())
  .catch([])
  .transform(validSources)
  .optional();
