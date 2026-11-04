import { z } from "zod";

/**
 * Registro de transparência gravado em Message.trace (só mensagens do AGENT):
 * o que o agent entendeu, o que fez, com que confiança e por quê.
 */
export const AGENT_INTENTS = [
  "QUESTION",
  "CHECK_TICKET",
  "OPEN_TICKET",
  "COMPLEMENT",
  "REOPEN",
  "TALK_TO_ANALYST",
  "OUT_OF_SCOPE",
  "OTHER",
] as const;

export const agentActionSchema = z.strictObject({
  tool: z.string().min(1),
  summary: z.string().min(1),
  status: z.enum(["SUCCESS", "ERROR", "SKIPPED"]),
});

/** Artigo da central de ajuda citado na resposta (o código só aceita slug vindo da busca do turno). */
export const agentSourceSchema = z.strictObject({
  kind: z.literal("ARTICLE"),
  slug: z.string(),
  title: z.string(),
});

export const agentTraceSchema = z.strictObject({
  understood: z.string().min(1),
  intent: z.enum(AGENT_INTENTS),
  actions: z.array(agentActionSchema),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  reason: z.string().min(1),
  /** Opcional: traces gravados antes da central de ajuda não têm o campo. */
  sources: z.array(agentSourceSchema).max(3).optional(),
});

export type AgentAction = z.infer<typeof agentActionSchema>;
export type AgentSource = z.infer<typeof agentSourceSchema>;
export type AgentIntent = AgentTrace["intent"];
export type AgentTrace = z.infer<typeof agentTraceSchema>;
