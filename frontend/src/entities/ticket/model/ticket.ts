import { z } from "zod";

const ticketPrioritySchema = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
const ticketCategorySchema = z.enum([
  "ACCESS",
  "NETWORK_VPN",
  "HARDWARE",
  "SOFTWARE",
  "EMAIL",
  "OTHER",
]);
const ticketStatusSchema = z.enum([
  "WAITING_ANALYST",
  "IN_PROGRESS",
  "WAITING_EMPLOYEE",
  "APPROVED",
]);

export const ticketSummarySchema = z.object({
  code: z.string().min(1),
  type: z.enum(["INC", "REQ"]),
  category: ticketCategorySchema,
  priority: ticketPrioritySchema,
  status: ticketStatusSchema,
  statusLabel: z.string().min(1),
  title: z.string().min(1),
  createdAt: z.iso.datetime(),
  dueAt: z.iso.datetime().nullable(),
  overdue: z.boolean(),
});

const openTicketCount = z.number().int().nonnegative();

export const ticketLookupSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("NO_OPEN_TICKETS"),
    openTicketCount: z.literal(0),
    totalMatches: z.literal(0),
    tickets: z.tuple([]),
  }),
  z.object({
    outcome: z.literal("NO_MATCH"),
    openTicketCount,
    totalMatches: z.literal(0),
    tickets: z.tuple([]),
  }),
  z.object({
    outcome: z.literal("SINGLE_MATCH"),
    openTicketCount,
    totalMatches: z.literal(1),
    tickets: z.tuple([ticketSummarySchema]),
  }),
  z.object({
    outcome: z.literal("MULTIPLE_MATCHES"),
    openTicketCount,
    totalMatches: z.number().int().nonnegative(),
    tickets: z.array(ticketSummarySchema),
  }),
  z.object({
    outcome: z.literal("UNAVAILABLE"),
    openTicketCount: z.null(),
    totalMatches: z.null(),
    tickets: z.tuple([]),
  }),
]);

export type TicketPriority = z.infer<typeof ticketPrioritySchema>;
export type TicketCategory = z.infer<typeof ticketCategorySchema>;
export type TicketStatus = z.infer<typeof ticketStatusSchema>;
export type TicketSummary = z.infer<typeof ticketSummarySchema>;
export type TicketLookup = z.infer<typeof ticketLookupSchema>;
