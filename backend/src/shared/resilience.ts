import { setTimeout as delay } from "node:timers/promises";

export type ResilienceOptions = { timeoutMs: number; attempts: number; retryDelayMs: number };

/** Encerrar pelo timeout não cancela a tentativa; o `race` já trata a rejeição tardia dela. */
async function withTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
  });
  try {
    return await Promise.race([operation(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Timeout e retry por tentativa. Esgotadas as tentativas, lança o erro de `unavailable()`:
 * nenhum detalhe da falha original chega a quem chamou.
 */
export async function withRetry<T>(operation: () => Promise<T>, options: ResilienceOptions, unavailable: () => Error): Promise<T> {
  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    try {
      return await withTimeout(operation, options.timeoutMs);
    } catch {
      if (attempt < options.attempts) await delay(options.retryDelayMs);
    }
  }
  throw unavailable();
}
