import { z } from "zod";
import { conversationSchema } from "@/entities/conversation";
import { agentMessageSchema } from "@/entities/message";
import {
  ticketDraftSchema,
  ticketLookupSchema,
  ticketSummarySchema,
} from "@/entities/ticket";

export const CHAT_MESSAGE_MAX_LENGTH = 2000;

// O backend recusa NUL, que truncaria o texto gravado no SQLite.
export const chatMessageSchema = z
  .string()
  .transform((text) => text.replaceAll("\0", ""))
  .pipe(z.string().trim().min(1).max(CHAT_MESSAGE_MAX_LENGTH));

// Ausente vale como null: os campos chegaram depois e são opcionais na UI.
const nullable = <T extends z.ZodType>(schema: T) =>
  schema.nullish().transform((value) => value ?? null);

export const chatResponseSchema = z.object({
  conversation: conversationSchema,
  message: agentMessageSchema,
  ticketLookup: ticketLookupSchema.nullable(),
  ticketDraft: nullable(ticketDraftSchema),
  // Só um atalho de digitação: fora do formato, some sem derrubar o turno.
  quickReplies: z
    .array(z.string().trim().min(1))
    .min(1)
    .transform((options) => [...new Set(options)])
    .nullish()
    .catch(null)
    .transform((value) => value ?? null),
});

export const confirmDraftResponseSchema = z.object({
  message: agentMessageSchema,
  ticket: ticketSummarySchema,
});

export const cancelDraftResponseSchema = z.object({
  message: agentMessageSchema,
});

export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type ConfirmDraftResponse = z.infer<typeof confirmDraftResponseSchema>;
export type CancelDraftResponse = z.infer<typeof cancelDraftResponseSchema>;

export type ParsedChatMessage =
  | { status: "ok"; message: string }
  | { status: "empty" | "too-long" };

export function parseChatMessage(text: string): ParsedChatMessage {
  const parsed = chatMessageSchema.safeParse(text);
  if (parsed.success) return { status: "ok", message: parsed.data };

  const isTooLong = parsed.error.issues.some(
    (issue) => issue.code === "too_big",
  );
  return { status: isTooLong ? "too-long" : "empty" };
}
