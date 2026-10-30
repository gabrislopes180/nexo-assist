import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Resolve um DATABASE_URL `file:` relativo (ex.: `file:./dev.db`) em relação a `baseDir`,
 * em vez do diretório de onde o processo foi iniciado. URLs `file:` absolutas e URLs que
 * não são `file:` (libsql://, :memory:, ...) voltam sem mudança.
 */
export function resolveDatabaseUrl(url: string, baseDir: string): string {
  if (!url.startsWith("file:")) return url;
  const rest = url.slice("file:".length);
  const queryIndex = rest.indexOf("?");
  const filePath = queryIndex === -1 ? rest : rest.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : rest.slice(queryIndex);
  // file:///..., file:/... e file:C:/... já são absolutos.
  if (filePath.startsWith("/") || path.win32.isAbsolute(filePath)) return url;
  return pathToFileURL(path.resolve(baseDir, filePath)).href + query;
}
