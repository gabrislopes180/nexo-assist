// PROVISÓRIO: remover quando o backend expuser /console (ver plano do console)
import type { z } from "zod";
import { ApiError } from "../api-error";
import { handleMockRequest, type MockContext } from "./handlers";
import { currentMockScenario, type MockScenario } from "./scenario";

export interface MockRequestOptions<T> {
  method?: "GET" | "POST";
  schema: z.ZodType<T>;
  mockContext?: MockContext;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Responde como o `apiRequest`: mesmos erros e mesma validação na saída. */
export async function mockRequest<T>(
  path: string,
  { method = "GET", schema, mockContext }: MockRequestOptions<T>,
  scenario: MockScenario = currentMockScenario(),
): Promise<T> {
  if (method === "POST" && !mockContext) {
    throw new Error("mockContext.viewer é obrigatório nas ações do console.");
  }
  await sleep(scenario === "slow" ? 2_500 : 350);
  if (scenario === "error") {
    throw new ApiError("unavailable", "A API está indisponível.");
  }

  const { status, body } = handleMockRequest({
    method,
    path,
    context: mockContext,
    now: new Date(),
    scenario,
  });
  // Cópia: a UI nunca segura referência ao estado em memória.
  const payload: unknown = structuredClone(body);

  if (status >= 400) {
    const error = (payload as { error: { code: string; message: string } })
      .error;
    throw new ApiError("http", error.message, { status, code: error.code });
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError("invalid-response", "Resposta fora do formato.", {
      status,
      cause: parsed.error,
    });
  }
  return parsed.data;
}
