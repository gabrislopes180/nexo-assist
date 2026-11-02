import { z } from "zod";
import {
  ticketCategorySchema,
  ticketPrioritySchema,
  ticketSummarySchema,
  ticketTypeSchema,
} from "./ticket";

export const affectedScopeSchema = z.enum(["INDIVIDUAL", "TEAM", "COMPANY"]);

export const ticketDraftSchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.string().min(1),
    kind: z.literal("COMPLEMENT"),
    ticket: ticketSummarySchema,
    content: z.string().min(1),
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal("CREATE"),
    type: ticketTypeSchema,
    category: ticketCategorySchema,
    priority: ticketPrioritySchema,
    title: z.string().min(1),
    description: z.string().min(1),
    affectedScope: affectedScopeSchema,
    affectedDescription: z.string().min(1).optional(),
    dueAtPreview: z.iso.datetime(),
  }),
]);

export type AffectedScope = z.infer<typeof affectedScopeSchema>;
export type TicketDraft = z.infer<typeof ticketDraftSchema>;

/** O que a pessoa pode editar antes de confirmar; o resto do rascunho fica travado. */
export type DraftValues =
  | {
      kind: "CREATE";
      title: string;
      description: string;
      affectedScope: AffectedScope;
    }
  | { kind: "COMPLEMENT"; content: string };

export type DraftConfirmBody =
  | {
      kind: "CREATE";
      title: string;
      description: string;
      affectedScope: AffectedScope;
      affectedDescription?: string;
    }
  | { kind: "COMPLEMENT"; content: string };

/** Só `pending` aceita Confirmar, Editar e Cancelar. */
export type DraftStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "superseded"
  | "unavailable";
