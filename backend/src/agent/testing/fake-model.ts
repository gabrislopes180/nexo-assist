import { MastraLanguageModelV2Mock } from "@mastra/core/test-utils/llm-mock";

/** Roteiro de um passo do modelo: testes de decisão não dependem da LLM real. */
export type FakeStep =
  | { kind: "text"; text: string; finishReason?: "stop" | "length" }
  | { kind: "tool"; input: Record<string, unknown>; toolName?: string }
  | { kind: "error"; error: Error }
  /** Só termina quando o `abortSignal` da chamada dispara. */
  | { kind: "hang" }
  /** Nunca termina, nem com abort. */
  | { kind: "hang-ignoring-abort" };

const USAGE = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };

type CallOptions = Parameters<MastraLanguageModelV2Mock["doGenerate"]>[0];

function resultOf(step: Extract<FakeStep, { kind: "text" | "tool" }>, callIndex: number) {
  if (step.kind === "tool") {
    return {
      content: [{ type: "tool-call" as const, toolCallId: `call-${callIndex}`, toolName: step.toolName ?? "searchMyOpenTickets", input: JSON.stringify(step.input) }],
      finishReason: "tool-calls" as const,
      usage: USAGE,
      warnings: [],
    };
  }
  return { content: [{ type: "text" as const, text: step.text }], finishReason: step.finishReason ?? ("stop" as const), usage: USAGE, warnings: [] };
}

function waitForAbort(signal: AbortSignal | undefined): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
}

export function fakeModel(steps: readonly FakeStep[]) {
  const calls: CallOptions[] = [];
  const model = new MastraLanguageModelV2Mock({
    // `agent.generate` usa doGenerate, não doStream.
    doGenerate: async (options) => {
      const index = calls.length;
      calls.push(options);
      const step = steps[Math.min(index, steps.length - 1)];
      if (step === undefined) throw new Error("Roteiro do modelo vazio");
      if (step.kind === "error") throw step.error;
      if (step.kind === "hang") return waitForAbort(options.abortSignal);
      if (step.kind === "hang-ignoring-abort") return new Promise<never>(() => undefined);
      return resultOf(step, index);
    },
  });
  return { model, calls };
}

export function decisionJson(content: string, overrides: Record<string, string> = {}): string {
  return JSON.stringify({ content, understood: "Pedido entendido", intent: "CHECK_TICKET", confidence: "HIGH", reason: "Motivo", ...overrides });
}
