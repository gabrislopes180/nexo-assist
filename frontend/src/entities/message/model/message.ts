import { z } from "zod";
import { agentSourcesSchema } from "./agent-sources";

export const agentActionSchema = z.object({
  tool: z.string().min(1),
  summary: z.string(),
  status: z.enum(["SUCCESS", "ERROR", "SKIPPED"]),
});

// Campos antigos ou inválidos ficam ausentes, sem inventar uma explicação.
const explanationText = z.string().trim().min(1).optional().catch(undefined);

export const agentTraceSchema = z.object({
  understood: explanationText,
  intent: z
    .enum([
      "QUESTION", "CHECK_TICKET", "OPEN_TICKET", "COMPLEMENT", "REOPEN",
      "TALK_TO_ANALYST", "OUT_OF_SCOPE", "OTHER",
    ])
    .optional()
    .catch(undefined),
  actions: z.array(agentActionSchema),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]).optional().catch(undefined),
  reason: explanationText,
  sources: agentSourcesSchema,
  // O chat valida os anexos com os contratos de chamado na camada de feature.
  attachments: z.unknown().optional(),
});

export const agentMessageSchema = z.object({
  id: z.string().min(1),
  content: z.string(),
  createdAt: z.iso.datetime(),
  trace: agentTraceSchema.nullish().transform((trace) => trace ?? { actions: [] }),
});

export type AgentAction = z.infer<typeof agentActionSchema>;
export type AgentTrace = z.infer<typeof agentTraceSchema>;
