import type { MastraModelConfig } from "@mastra/core/llm";
import { z } from "zod";

export const DEFAULT_AGENT_MODEL = "google/gemini-3.5-flash-lite";
export const DEFAULT_AGENT_TIMEOUT_MS = 120_000;

/** Acima disso o `setTimeout` dispara quase na hora. */
const MAX_TIMER_MS = 2_147_483_647;

export type AgentConfig = {
  /** Vai direto em `new Agent({ model })`. A chave é explícita porque `LLM_API_KEY` não é o nome que o provedor procura. */
  model: { id: `${string}/${string}`; apiKey: string } & MastraModelConfig;
  /** Limite do turno inteiro no runner. */
  timeoutMs: number;
};

const envSchema = z.object({
  AGENT_MODEL: z
    .templateLiteral([z.string().regex(/^[a-z0-9-]+$/), "/", z.string().regex(/^\S+$/)])
    .default(DEFAULT_AGENT_MODEL),
  LLM_API_KEY: z.string().min(1),
  AGENT_TIMEOUT_MS: z.coerce.number().int().positive().max(MAX_TIMER_MS).default(DEFAULT_AGENT_TIMEOUT_MS),
});

/** Lança erro citando só os nomes das variáveis inválidas, nunca os valores. */
export function loadAgentConfig(env: Record<string, string | undefined>): AgentConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const names = new Set(parsed.error.issues.map((issue) => String(issue.path[0])));
    throw new Error(`Configuração inválida: ${[...names].join(", ")}`);
  }
  return { model: { id: parsed.data.AGENT_MODEL, apiKey: parsed.data.LLM_API_KEY }, timeoutMs: parsed.data.AGENT_TIMEOUT_MS };
}
