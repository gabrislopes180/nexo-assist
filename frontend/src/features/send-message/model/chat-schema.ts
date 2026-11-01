import { z } from "zod";
import { conversationSchema } from "@/entities/conversation";
import { agentMessageSchema } from "@/entities/message";
import { ticketLookupSchema } from "@/entities/ticket";

export const CHAT_MESSAGE_MAX_LENGTH = 2000;

// O backend recusa NUL, que truncaria o texto gravado no SQLite.
export const chatMessageSchema = z
  .string()
  .transform((text) => text.replaceAll("\0", ""))
  .pipe(z.string().trim().min(1).max(CHAT_MESSAGE_MAX_LENGTH));

export const chatResponseSchema = z.object({
  conversation: conversationSchema,
  message: agentMessageSchema,
  ticketLookup: ticketLookupSchema.nullable(),
});

export type ChatResponse = z.infer<typeof chatResponseSchema>;

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
