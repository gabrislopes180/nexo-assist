import { z } from "zod";
import { agentSourcesSchema } from "./agent-sources";

export const agentActionSchema = z.object({
  tool: z.string().min(1),
  summary: z.string(),
  status: z.enum(["SUCCESS", "ERROR", "SKIPPED"]),
});

export const agentMessageSchema = z.object({
  id: z.string().min(1),
  content: z.string(),
  createdAt: z.iso.datetime(),
  trace: z.object({
    actions: z.array(agentActionSchema),
    sources: agentSourcesSchema,
  }),
});

export type AgentAction = z.infer<typeof agentActionSchema>;
