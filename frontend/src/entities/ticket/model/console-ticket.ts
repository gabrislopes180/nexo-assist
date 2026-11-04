import { z } from "zod";
import {
  ticketCategorySchema,
  ticketPrioritySchema,
  ticketTypeSchema,
} from "./ticket";

export const consoleTicketStatusSchema = z.enum([
  "WAITING_ANALYST",
  "IN_PROGRESS",
  "WAITING_EMPLOYEE",
  "APPROVED",
  "RESOLVED",
]);

export const consoleTicketSchema = z.object({
  code: z.string().min(1),
  type: ticketTypeSchema,
  category: ticketCategorySchema,
  priority: ticketPrioritySchema,
  status: consoleTicketStatusSchema,
  statusLabel: z.string().min(1),
  title: z.string().min(1),
  createdAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullable(),
  /** Null em WAITING_EMPLOYEE (pausado) e RESOLVED. */
  dueAt: z.iso.datetime().nullable(),
  overdue: z.boolean(),
});

export const conversationTicketsResponseSchema = z.object({
  conversationTicket: consoleTicketSchema.nullable(),
  otherTickets: z.array(consoleTicketSchema),
});

export type ConsoleTicketStatus = z.infer<typeof consoleTicketStatusSchema>;
export type ConsoleTicket = z.infer<typeof consoleTicketSchema>;
export type ConversationTickets = z.infer<
  typeof conversationTicketsResponseSchema
>;
