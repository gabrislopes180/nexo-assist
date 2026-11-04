import { z } from "zod";
import { TICKET_CATEGORIES } from "@/shared/config/ticket-category";

/**
 * `GET /help/articles/:slug`. O texto é puro (com quebras de linha) e nunca é
 * interpretado como HTML. Categoria ou data fora do formato somem sem derrubar
 * a leitura: o que importa é o texto.
 */
export const articleResponseSchema = z
  .object({
    article: z.object({
      slug: z.string().min(1),
      title: z.string().min(1),
      category: z.enum(TICKET_CATEGORIES).nullable().catch(null),
      content: z.string(),
      updatedAt: z.iso.datetime().nullable().catch(null),
    }),
  })
  .transform(({ article }) => article);

export type Article = z.infer<typeof articleResponseSchema>;
