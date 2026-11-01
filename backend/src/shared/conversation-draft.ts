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

export const createDraftSchema = z.strictObject({
  ...draftBase,
  kind: z.literal("CREATE"),
  type: z.enum(TicketType),
  category: z.enum(TicketCategory),
  priority: z.enum(TicketPriority),
  title: z.string().min(1),
  description: z.string().min(1),
  affectedScope: z.enum(AffectedScope),
  affectedDescription: z.string().min(1).optional(),
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

export type CreateDraft = z.infer<typeof createDraftSchema>;
export type UpdateDraft = z.infer<typeof updateDraftSchema>;
export type ReopenDraft = z.infer<typeof reopenDraftSchema>;
export type ComplementDraft = z.infer<typeof complementDraftSchema>;
export type PendingDraft = z.infer<typeof pendingDraftSchema>;
