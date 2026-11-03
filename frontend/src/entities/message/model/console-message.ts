import { z } from "zod";
import { timelineMessageSchema, type TimelineMessage } from "./timeline-message";

/** O console usa a mesma mensagem da linha do tempo. */
export const consoleMessageSchema = timelineMessageSchema;

export const consoleMessagesResponseSchema = z.object({
  messages: z.array(consoleMessageSchema),
});

export type ConsoleMessageData = TimelineMessage;
