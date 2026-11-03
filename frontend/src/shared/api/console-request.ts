import type { z } from "zod";
import { mockRequest, type MockContext } from "./console-mock";
import { apiRequest } from "./http-client";

interface ConsoleRequestOptions<T> {
  method?: "GET" | "POST";
  schema: z.ZodType<T>;
  /** Só o mock usa: no modo real, o analista vem da sessão. */
  mockContext?: MockContext;
}

/** `real` só quando NEXT_PUBLIC_CONSOLE_API=real; o padrão é o mock. */
export function consoleApiMode(): "mock" | "real" {
  return process.env.NEXT_PUBLIC_CONSOLE_API === "real" ? "real" : "mock";
}

// Para trocar pela API real: NEXT_PUBLIC_CONSOLE_API=real, apagar console-mock/
// e este desvio, e tirar o mockContext das features.
export function consoleRequest<T>(
  path: string,
  { method = "GET", schema, mockContext }: ConsoleRequestOptions<T>,
): Promise<T> {
  if (consoleApiMode() === "real") {
    return apiRequest(path, { method, schema });
  }
  return mockRequest(path, { method, schema, mockContext });
}
