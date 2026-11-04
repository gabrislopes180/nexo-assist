import { z } from "zod";
import {
  consoleTicketSchema,
  consoleTicketStatusSchema,
} from "./console-ticket";
import { ticketPrioritySchema } from "./ticket";
import { affectedScopeSchema } from "./ticket-draft";

/** Destinos que o analista escolhe; WAITING_ANALYST só volta pelo sistema. */
export const analystTargetStatusSchema = z.enum([
  "IN_PROGRESS",
  "WAITING_EMPLOYEE",
  "APPROVED",
  "RESOLVED",
]);

export const ticketEventTypeSchema = z.enum([
  "CREATED",
  "STATUS_CHANGED",
  "PRIORITY_CHANGED",
  "COMMENT",
  "TRANSFERRED",
  "REOPENED",
]);

export const ticketActorTypeSchema = z.enum([
  "EMPLOYEE",
  "AGENT",
  "ANALYST",
  "SYSTEM",
]);

const personSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

export const consoleTicketEventSchema = z.object({
  id: z.string().min(1),
  type: ticketEventTypeSchema,
  actorType: ticketActorTypeSchema,
  /** Null para AGENT e SYSTEM. */
  actor: personSchema.nullable(),
  /** Nota interna, complemento ou motivo. Só analistas veem. */
  content: z.string().nullable(),
  fromStatus: consoleTicketStatusSchema.nullable(),
  toStatus: consoleTicketStatusSchema.nullable(),
  fromPriority: ticketPrioritySchema.nullable(),
  toPriority: ticketPrioritySchema.nullable(),
  /** Novo prazo definido por este evento. */
  dueAt: z.iso.datetime().nullable(),
  conversationId: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const consoleTicketDetailSchema = consoleTicketSchema.extend({
  description: z.string(),
  affectedScope: affectedScopeSchema,
  affectedDescription: z.string().nullable(),
  owner: personSchema.extend({ department: z.string().nullable() }),
  updatedAt: z.iso.datetime(),
  slaStartedAt: z.iso.datetime().nullable(),
  slaPaused: z.boolean(),
  /** Oferecer só estes destinos; a regra é do backend. */
  allowedStatuses: z.array(consoleTicketStatusSchema),
  statusNoteRequired: z.array(consoleTicketStatusSchema),
  /** Ordem cronológica, no máximo os 200 mais recentes. */
  events: z.array(consoleTicketEventSchema),
});

export const consoleTicketDetailResponseSchema = z.object({
  ticket: consoleTicketDetailSchema,
});

export const changeTicketStatusResponseSchema = z.object({
  ticket: consoleTicketDetailSchema,
  /** false: o chamado já estava no destino; nada foi gravado, nem a nota. */
  changed: z.boolean(),
});

/** O backend devolve no máximo esta quantidade de eventos. */
export const TICKET_EVENTS_LIMIT = 200;

export type AnalystTargetStatus = z.infer<typeof analystTargetStatusSchema>;
export type TicketEventType = z.infer<typeof ticketEventTypeSchema>;
export type ConsoleTicketEvent = z.infer<typeof consoleTicketEventSchema>;
export type ConsoleTicketDetail = z.infer<typeof consoleTicketDetailSchema>;
export type ChangeTicketStatusResponse = z.infer<
  typeof changeTicketStatusResponseSchema
>;
