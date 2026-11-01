import { z } from "zod";

const agentActionSchema = z.object({
  tool: z.string().min(1),
  summary: z.string(),
  status: z.enum(["SUCCESS", "ERROR", "SKIPPED"]),
});

export const agentMessageSchema = z.object({
  id: z.string().min(1),
  content: z.string(),
  createdAt: z.iso.datetime(),
  trace: z.object({ actions: z.array(agentActionSchema) }),
});

export type AgentAction = z.infer<typeof agentActionSchema>;
