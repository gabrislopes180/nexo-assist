/**
 * Resumo de erro seguro para log: nome, código e pilha, sem a mensagem. Erros do Prisma e de
 * provedores repetem os argumentos da chamada na mensagem, o que levaria dados do usuário ao log.
 */
export function describeErrorForLog(error: unknown): string {
  if (!(error instanceof Error)) return "erro sem detalhes";
  const code = "code" in error && typeof error.code === "string" ? ` ${error.code}` : "";
  const frames = (error.stack ?? "").split("\n").filter((line) => /^\s+at /.test(line));
  return [`${error.name}${code}`, ...frames].join("\n");
}
