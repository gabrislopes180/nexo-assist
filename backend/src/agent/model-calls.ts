import { AsyncLocalStorage } from "node:async_hooks";
import { ModelRouterLanguageModel, type MastraModelConfig } from "@mastra/core/llm";
import { describeErrorForLog } from "../shared/safe-error.js";

/** Chamadas ao provedor num turno. `failures` guarda só nome, código e status do erro. */
export type ModelCallStats = { calls: number; failures: string[] };

const currentTurn = new AsyncLocalStorage<ModelCallStats>();

type GenerateCapable = { doGenerate: (...args: never[]) => unknown; doStream: (...args: never[]) => unknown };

function hasModelMethods(model: object): model is GenerateCapable {
  return "doGenerate" in model && typeof model.doGenerate === "function" && "doStream" in model && typeof model.doStream === "function";
}

function firstLine(error: unknown): string {
  return describeErrorForLog(error).split("\n")[0] ?? "erro sem detalhes";
}

/**
 * Conta cada chamada ao provedor, inclusive os retries internos do Mastra, que não aparecem em
 * `steps`. Proxy transparente: os demais membros seguem ligados ao modelo original.
 */
function wrap<T extends GenerateCapable>(model: T): T {
  return new Proxy(model, {
    get(target, property) {
      if (property === "doGenerate" || property === "doStream") {
        const method: unknown = Reflect.get(target, property, target);
        if (typeof method !== "function") return method;
        return async (...args: unknown[]): Promise<unknown> => {
          const stats = currentTurn.getStore();
          if (stats) stats.calls += 1;
          try {
            return await Reflect.apply(method, target, args);
          } catch (error) {
            stats?.failures.push(firstLine(error));
            throw error;
          }
        };
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function isRouterConfig(model: object): model is { id: `${string}/${string}`; apiKey?: string } {
  return "id" in model && typeof model.id === "string" && model.id.includes("/") && !("doGenerate" in model);
}

export function instrumentModel<T extends MastraModelConfig>(model: T): T | ModelRouterLanguageModel {
  if (typeof model === "object" && model !== null) {
    if (hasModelMethods(model)) return wrap(model);
    if (isRouterConfig(model)) return wrap(new ModelRouterLanguageModel(model));
  }
  return model;
}

/** `stats` pode vir de fora: assim um turno que falha ainda informa quantas chamadas fez. */
export async function trackModelCalls<T>(operation: () => Promise<T>, stats: ModelCallStats = { calls: 0, failures: [] }): Promise<{ result: T; stats: ModelCallStats }> {
  const result = await currentTurn.run(stats, operation);
  return { result, stats };
}
