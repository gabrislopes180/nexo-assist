import { RequestContext } from "@mastra/core/request-context";
import { AgentUnavailableError, type AgentRunner, type AgentTurnInput } from "../chat/agent-runner.js";
import type { HistoryMessage } from "../conversations/conversation-service.js";
import { describeErrorForLog } from "../shared/safe-error.js";
import { DEFAULT_AGENT_TIMEOUT_MS } from "./config.js";
import { STRUCTURED_OUTPUT_INSTRUCTIONS } from "./instructions.js";
import { trackModelCalls, type ModelCallStats } from "./model-calls.js";
import { declinesPerson } from "./tools/handoff-intent.js";
import { createNexoAgent, type NexoAgentDeps } from "./nexo-agent.js";
import { createTurnRecorder, type TurnContextValues } from "./tools/turn-recorder.js";
import { codesShownAsDuplicates, composeReply, knownCodesFrom, llmDecisionSchema, offerDeclinedIn, overdueOfferCodeFrom, parseDecision, relatedCodeFrom, triedArticleFrom } from "./trace.js";

const MAX_STEPS = 4;
const MODEL_SETTINGS = { maxOutputTokens: 1024, maxRetries: 1, temperature: 0 };

/** Sem texto do usuário: só o que serve para acompanhar custo e latência. */
export type TurnMetrics = {
  latencyMs: number;
  steps: number | null;
  totalTokens: number | null;
  finishReason: string;
  /** Chamadas ao provedor, contando os retries internos do Mastra. */
  modelCalls: number;
  /** Nome, código e status de cada chamada que falhou; nunca a mensagem. */
  failedCalls: string[];
};

export type AgentRunnerDeps = NexoAgentDeps & { timeoutMs?: number; onTurnMetrics?: (metrics: TurnMetrics) => void };

function toPromptMessage({ authorType, content }: HistoryMessage) {
  if (authorType === "EMPLOYEE") return { role: "user" as const, content };
  return { role: "assistant" as const, content: authorType === "ANALYST" ? `[Analista] ${content}` : content };
}

/** Rejeita no abort mesmo se o modelo ignorar o sinal: o limite do turno não depende do provedor. */
function rejectOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new AgentUnavailableError()), { once: true });
  });
}

export function createAgentRunner({ timeoutMs = DEFAULT_AGENT_TIMEOUT_MS, onTurnMetrics, ...deps }: AgentRunnerDeps): AgentRunner {
  const agent = createNexoAgent(deps);

  async function generate(input: AgentTurnInput, requestContext: RequestContext<TurnContextValues>, signal: AbortSignal) {
    const messages = [...input.history.map(toPromptMessage), { role: "user" as const, content: input.message }];
    return agent.generate(messages, {
      maxSteps: MAX_STEPS,
      abortSignal: signal,
      requestContext,
      modelSettings: MODEL_SETTINGS,
      structuredOutput: {
        schema: llmDecisionSchema,
        // Nativo com tools nunca entregou o objeto no Gemini; injeção cobre também o turno sem tool.
        jsonPromptInjection: "system",
        instructions: STRUCTURED_OUTPUT_INSTRUCTIONS,
        errorStrategy: "warn",
      },
    });
  }

  return {
    async runTurn(input) {
      const recorder = createTurnRecorder();
      const requestContext = new RequestContext<TurnContextValues>();
      requestContext.set("actorId", input.actor.id);
      requestContext.set("actorName", input.actor.name);
      requestContext.set("message", input.message);
      const agentMessages = input.history.flatMap(({ authorType, content }) => (authorType === "AGENT" ? [content] : []));
      // Só códigos de avisos de parecido: um código citado numa consulta de status não foi oferecido como duplicado.
      requestContext.set("shownCodes", codesShownAsDuplicates(agentMessages));
      requestContext.set("relatedCode", relatedCodeFrom(agentMessages));
      // Só vale se a oferta for a última mensagem da conversa: depois de outra mensagem do usuário, ela expirou.
      const lastMessage = input.history.at(-1);
      requestContext.set("overdueOfferCode", lastMessage?.authorType === "AGENT" ? overdueOfferCodeFrom([lastMessage.content]) : null);
      requestContext.set("offerDeclinedRecently", offerDeclinedIn(input.history));
      requestContext.set("knownCodes", knownCodesFrom(input.history));
      requestContext.set("returnedFromAnalyst", input.returnedFromAnalyst);
      if (input.pendingDraft) requestContext.set("pendingDraft", input.pendingDraft);
      requestContext.set("triedArticle", triedArticleFrom(input.history, input.message));
      requestContext.set("recorder", recorder);

      const startedAt = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const { signal } = controller;
      let metrics: Pick<TurnMetrics, "steps" | "totalTokens" | "finishReason"> = { steps: null, totalTokens: null, finishReason: "failed" };
      const calls: ModelCallStats = { calls: 0, failures: [] };
      try {
        const output = await Promise.race([
          trackModelCalls(() => generate(input, requestContext, signal), calls).then(({ result }) => result),
          rejectOnAbort(signal),
        ]);
        metrics = { steps: output.steps.length, totalTokens: output.usage.totalTokens ?? null, finishReason: output.finishReason ?? "unknown" };
        // Ao abortar, `generate` não lança: devolve `aborted` com texto vazio.
        if (output.finishReason === "aborted" || output.finishReason === "error") throw new AgentUnavailableError();

        const reply = composeReply({
          message: input.message,
          decision: parseDecision(output.object, output.text),
          fallbackText: output.text,
          executions: recorder.all(),
          drafts: recorder.drafts(),
          handoffs: recorder.handoffs(),
          articleSearches: recorder.articleSearches(),
          overdueOfferActive: requestContext.get("overdueOfferCode") !== null,
          // A recusa atual ou recente impede insistir na oferta, inclusive após a devolução.
          suppressOverdueOffer: declinesPerson(input.message) || offerDeclinedIn(input.history),
        });
        if (!reply) throw new AgentUnavailableError();
        return { ...reply, quickReplies: reply.quickReplies ?? null, handoff: reply.handoff ?? null };
      } catch (error) {
        console.error("Falha no turno do agent:", describeErrorForLog(error));
        throw new AgentUnavailableError();
      } finally {
        clearTimeout(timer);
        onTurnMetrics?.({ latencyMs: Date.now() - startedAt, ...metrics, modelCalls: calls.calls, failedCalls: [...calls.failures] });
      }
    },
  };
}
