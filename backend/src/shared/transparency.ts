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

export const agentTraceSchema = z.strictObject({
  understood: z.string().min(1),
  intent: z.enum(AGENT_INTENTS),
  actions: z.array(agentActionSchema),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  reason: z.string().min(1),
});

export type AgentAction = z.infer<typeof agentActionSchema>;
export type AgentIntent = AgentTrace["intent"];
export type AgentTrace = z.infer<typeof agentTraceSchema>;
