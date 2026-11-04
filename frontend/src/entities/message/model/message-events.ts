import { z } from "zod";
import { timelineMessageSchema } from "./timeline-message";

/** `message.created` do SSE: igual nos streams do funcionário e do analista. */
export const messageCreatedEventSchema = z.object({
  conversationId: z.string().min(1),
  message: timelineMessageSchema,
});
