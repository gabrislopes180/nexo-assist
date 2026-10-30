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
