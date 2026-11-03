import { z } from "zod";

const conversationParamSchema = z.string().trim().min(1).max(64);

/** `?conversation=` vem de fora: lixo vira null, sem quebrar a tela. */
export function parseConversationParam(raw: string | null): string | null {
  const parsed = conversationParamSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * O parâmetro vale mesmo fora do filtro atual. Sem ele, a tela larga abre a
 * primeira conversa visível; a estreita mostra a lista.
 */
export function resolveSelectedConversationId({
  param,
  visibleIds,
  isWide,
}: {
  param: string | null;
  visibleIds: string[];
  isWide: boolean;
}): string | null {
  if (param) return param;
  return isWide ? (visibleIds[0] ?? null) : null;
}
