import { z } from "zod";

/** Mesmo limite do backend para mensagens do chat e respostas do analista. */
export const MESSAGE_TEXT_MAX_LENGTH = 2000;

// O backend recusa NUL, que truncaria o texto gravado no SQLite.
export const messageTextSchema = z
  .string()
  .transform((text) => text.replaceAll("\0", ""))
  .pipe(z.string().trim().min(1).max(MESSAGE_TEXT_MAX_LENGTH));

export type ParsedMessageText =
  | { status: "ok"; message: string }
  | { status: "empty" | "too-long" };

export function parseMessageText(text: string): ParsedMessageText {
  const parsed = messageTextSchema.safeParse(text);
  if (parsed.success) return { status: "ok", message: parsed.data };

  const isTooLong = parsed.error.issues.some(
    (issue) => issue.code === "too_big",
  );
  return { status: isTooLong ? "too-long" : "empty" };
}
