import { z } from "zod";

/** Valor publicado no `.env.example`: serve para desenvolvimento, nunca para produção. */
const EXAMPLE_SESSION_SECRET = "dev-only-troque-em-producao-0123456789abcdef";

export type ApiConfig = {
  sessionSecret: string;
  corsOrigins: string[];
  isProduction: boolean;
};

/** Aceita só a origem canônica: recusa `*`, barra final, caminho e esquema ausente. */
function isExactOrigin(value: string): boolean {
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
}

const envSchema = z
  .object({
    SESSION_SECRET: z.string().min(32),
    CORS_ORIGINS: z
      .string()
      .transform((value) => value.split(",").map((origin) => origin.trim()))
      .pipe(z.array(z.string().refine(isExactOrigin))),
    NODE_ENV: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.SESSION_SECRET === EXAMPLE_SESSION_SECRET) {
      ctx.addIssue({ code: "custom", path: ["SESSION_SECRET"], message: "valor de exemplo em produção" });
    }
  });

/** Lança erro citando só os nomes das variáveis inválidas, nunca os valores. */
export function loadApiConfig(env: Record<string, string | undefined>): ApiConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const names = new Set(parsed.error.issues.map((issue) => String(issue.path[0])));
    throw new Error(`Configuração inválida: ${[...names].join(", ")}`);
  }
  return {
    sessionSecret: parsed.data.SESSION_SECRET,
    corsOrigins: parsed.data.CORS_ORIGINS,
    isProduction: parsed.data.NODE_ENV === "production",
  };
}
