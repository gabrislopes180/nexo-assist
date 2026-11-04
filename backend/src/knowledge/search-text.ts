/**
 * Normaliza texto para busca: minúsculas, sem marcas combinantes (acentos) e com espaços colapsados.
 * Necessário porque `contains` no SQLite não ignora acentos; aplique o mesmo
 * normalizador ao texto indexado (Article.searchText) e ao termo buscado.
 */
export function normalizeSearchText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Keyword repetida não pontua duas vezes, e a só de espaços viraria "" e casaria com tudo. */
export function normalizedKeywords(keywords: readonly string[]): string[] {
  return [...new Set(keywords.map(normalizeSearchText))].filter((keyword) => keyword !== "");
}

/** Termos que aparecem em qualquer relato de problema e não dizem qual é o problema (já normalizados). */
export const GENERIC_TERMS: ReadonlySet<string> = new Set([
  "parou", "parar", "parado", "parada", "para", "funciona", "funcionar", "funcionando", "funcionou",
  "nao", "sem", "com", "que", "meu", "minha", "esta", "ficou", "mais", "muito", "hoje",
  "problema", "problemas", "erro", "erros", "falha", "falhas", "falhando", "defeito", "quebrou", "quebrado",
  "ajuda", "preciso", "consigo", "conseguir", "consegue",
]);

/** Keyword (já normalizada) com ao menos um termo de 3 letras ou mais que não seja genérico. */
export function isSignificant(keyword: string): boolean {
  return keyword.split(" ").some((term) => term.length >= 3 && !GENERIC_TERMS.has(term));
}
