/** Status HTTP de erro de provedor (ex.: `statusCode` do AI SDK); fora da faixa, é ignorado. */
function httpStatusOf(error: Error): number | null {
  const status = "statusCode" in error ? error.statusCode : null;
  return typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
}

/**
 * Resumo de erro seguro para log: nome, código, status HTTP e pilha, sem a mensagem, o corpo,
 * os cabeçalhos nem a URL. Erros do Prisma e de provedores repetem os argumentos da chamada na
 * mensagem, o que levaria dados do usuário ao log.
 */
export function describeErrorForLog(error: unknown): string {
  if (!(error instanceof Error)) return "erro sem detalhes";
  const code = "code" in error && typeof error.code === "string" ? ` ${error.code}` : "";
  const status = httpStatusOf(error);
  const frames = (error.stack ?? "").split("\n").filter((line) => /^\s+at /.test(line));
  return [`${error.name}${code}${status === null ? "" : ` status=${status}`}`, ...frames].join("\n");
}
