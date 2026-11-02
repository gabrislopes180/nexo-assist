import { z } from "zod";
import { AffectedScope, TicketCategory, TicketPriority, TicketType } from "../generated/prisma/enums.js";

/**
 * Rascunho pendente de confirmação (Conversation.pendingDraft). Nenhuma escrita
 * acontece sem que o funcionário confirme o rascunho identificado por draftId.
 * Datas ficam como string ISO porque o campo é JSON.
 */
const draftBase = {
  draftId: z.string().min(1),
  createdAt: z.iso.datetime(),
};

const ticketCode = z.string().regex(/^(INC|REQ)-\d+$/);

/** Texto vindo de fora. NUL truncaria o valor gravado no SQLite. */
export function boundedText(max: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((text) => !text.includes("\u0000"));
}

export const createDraftSchema = z.strictObject({
  ...draftBase,
  kind: z.literal("CREATE"),
  type: z.enum(TicketType),
  category: z.enum(TicketCategory),
  priority: z.enum(TicketPriority),
  priorityReason: boundedText(500),
  title: boundedText(120),
  description: boundedText(2000),
  affectedScope: z.enum(AffectedScope),
  affectedDescription: boundedText(500).optional(),
});

export const updateDraftSchema = z.strictObject({
  ...draftBase,
  kind: z.literal("UPDATE"),
  ticketCode,
  comment: z.string().min(1),
});

export const reopenDraftSchema = z.strictObject({
  ...draftBase,
  kind: z.literal("REOPEN"),
  ticketCode,
  reason: z.string().min(1),
});

export const complementDraftSchema = z.strictObject({
  ...draftBase,
  kind: z.literal("COMPLEMENT"),
  ticketCode,
  content: z.string().min(1).max(2000),
});

export const pendingDraftSchema = z.discriminatedUnion("kind", [createDraftSchema, updateDraftSchema, reopenDraftSchema, complementDraftSchema]);

/** Os kinds que já têm confirmação; os outros não existem para as rotas de rascunho. */
export const confirmableDraftSchema = z.discriminatedUnion("kind", [createDraftSchema, complementDraftSchema]);

export type ConfirmableDraft = z.infer<typeof confirmableDraftSchema>;
export type CreateDraft = z.infer<typeof createDraftSchema>;
export type UpdateDraft = z.infer<typeof updateDraftSchema>;
export type ReopenDraft = z.infer<typeof reopenDraftSchema>;
export type ComplementDraft = z.infer<typeof complementDraftSchema>;
export type PendingDraft = z.infer<typeof pendingDraftSchema>;
