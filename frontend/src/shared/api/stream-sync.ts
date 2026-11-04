import { z } from "zod";

/** Primeiro evento de toda conexão SSE; protocolo, sem regra de negócio. */
export const streamSyncSchema = z.object({ mode: z.enum(["REPLAY", "RESYNC"]) });

/**
 * RESYNC: o servidor não repôs o que se perdeu (conexão nova ou `lastEventId`
 * fora do buffer) e quem consome precisa buscar de novo. Fora do formato, não.
 */
export function isResync(data: unknown): boolean {
  const parsed = streamSyncSchema.safeParse(data);
  return parsed.success && parsed.data.mode === "RESYNC";
}
