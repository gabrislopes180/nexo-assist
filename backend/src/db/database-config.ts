import { createHash } from "node:crypto";

export type DatabaseConfig = { url: string; authToken?: string; mode: "local" | "remote" };

/** O destino vem somente de DATABASE_URL. Credenciais não fazem parte das mensagens de erro. */
export function loadDatabaseConfig(env: Record<string, string | undefined>): DatabaseConfig {
  const url = env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL é obrigatória");
  if (url.startsWith("file:") && url.length > 5 && !url.includes("?") && !url.includes("#")) {
    return { url, mode: "local" };
  }
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("DATABASE_URL deve usar file: ou libsql://"); }
  if (parsed.protocol !== "libsql:" || !parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname && parsed.pathname !== "/")) {
    throw new Error("DATABASE_URL deve usar file: ou libsql://, sem credenciais ou parâmetros na URL");
  }
  const authToken = env.TURSO_AUTH_TOKEN?.trim();
  if (!authToken) throw new Error("TURSO_AUTH_TOKEN é obrigatório para DATABASE_URL remota");
  return { url, authToken, mode: "remote" };
}

export function requireLocalDatabase(env: Record<string, string | undefined>): DatabaseConfig {
  const config = loadDatabaseConfig(env);
  if (config.mode !== "local") throw new Error("Comando restrito a SQLite local (DATABASE_URL=file:). Para Turso use db:turso:inspect/migrate/init.");
  return config;
}

/** Identificador para conferir o alvo sem imprimir o endereço nem o token. */
export function databaseFingerprint(config: DatabaseConfig): string {
  return createHash("sha256").update(new URL(config.url).hostname).digest("hex").slice(0, 12);
}
