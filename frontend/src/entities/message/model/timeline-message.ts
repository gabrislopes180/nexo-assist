import { z } from "zod";
import { agentActionSchema } from "./message";

/** Mensagem da linha do tempo: igual no console, no chat do funcionário e no SSE. */
export const timelineMessageSchema = z.object({
  id: z.string().min(1),
  authorType: z.enum(["EMPLOYEE", "AGENT", "ANALYST", "SYSTEM"]),
  /** EMPLOYEE = dono, ANALYST = analista; AGENT e SYSTEM = null. */
  author: z
    .object({ id: z.string().min(1), name: z.string().min(1) })
    .nullable(),
  content: z.string(),
  createdAt: z.iso.datetime(),
  /** Só no AGENT. Fora do formato vira null: a trilha some, a mensagem fica. */
  trace: z
    .object({ actions: z.array(agentActionSchema) })
    .nullable()
    .optional()
    .catch(null),
});

export type TimelineMessage = z.infer<typeof timelineMessageSchema>;
