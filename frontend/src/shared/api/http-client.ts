import { z } from "zod";
import { ApiError } from "./api-error";

const REQUEST_TIMEOUT_MS = 15_000;

const backendErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

interface ApiRequestOptions<T> {
  method?: "GET" | "POST";
  body?: unknown;
  schema: z.ZodType<T>;
}

interface RawResponse {
  ok: boolean;
  status: number;
  text: string;
}

async function send(
  path: string,
  method: "GET" | "POST",
  body: unknown,
): Promise<RawResponse> {
  try {
    const response = await fetch(`/api${path}`, {
      method,
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    // Lido aqui para o timeout valer também durante a leitura do corpo.
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  } catch (cause) {
    throw new ApiError("unavailable", "A API não respondeu.", { cause });
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export async function apiRequest<T>(
  path: string,
  { method = "GET", body, schema }: ApiRequestOptions<T>,
): Promise<T> {
  const { ok, status, text } = await send(path, method, body);
  const payload = parseJson(text);

  if (!ok) {
    const backendError = backendErrorSchema.safeParse(payload);
    if (!backendError.success) {
      // Com o backend parado, o rewrite do Next devolve 500 em texto puro.
      throw new ApiError("unavailable", "A API está indisponível.", { status });
    }
    throw new ApiError("http", backendError.data.error.message, {
      status,
      code: backendError.data.error.code,
    });
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
