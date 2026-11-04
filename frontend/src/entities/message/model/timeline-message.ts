import { z } from "zod";
import { agentActionSchema } from "./message";

export const SYSTEM_KINDS = ["HANDOFF", "TAKEOVER", "RETURNED", "CLOSED"] as const;
/** Qual aviso é a mensagem SYSTEM; o texto (`content`) é só para exibir. */
export type SystemKind = (typeof SYSTEM_KINDS)[number];

/** Mensagem da linha do tempo: igual no console, no chat do funcionário e no SSE. */
export const timelineMessageSchema = z.object({
  id: z.string().min(1),
  authorType: z.enum(["EMPLOYEE", "AGENT", "ANALYST", "SYSTEM"]),
  /** EMPLOYEE = dono, ANALYST = analista; AGENT e SYSTEM = null. */
  author: z
    .object({ id: z.string().min(1), name: z.string().min(1) })
    .nullable(),
  /**
   * Só no SYSTEM; null nas demais. Valor novo ou ausente vira null: o marco
   * aparece sem ícone, a mensagem fica.
   */
  systemKind: z.enum(SYSTEM_KINDS).nullable().catch(null),
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
