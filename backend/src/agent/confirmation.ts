import { normalizeSearchText } from "../knowledge/search-text.js";

const CONFIRMATION_WORDS: ReadonlySet<string> = new Set([
  "confirmo",
  "confirma",
  "confirmar",
  "confirme",
  "confirmado",
  "confirmada",
  "confirmei",
  "gravar",
  "grava",
  "grave",
  "salvar",
  "salva",
  "salve",
]);
const CONFIRMATION_FILLERS: ReadonlySet<string> = new Set(
  "ok okay sim certo beleza blz pode por favor pf eu ja entao isso tudo ai o a esse este complemento rascunho".split(" "),
);

/**
 * Mensagem que é só uma confirmação ("confirmo", "pode confirmar"). Lista fechada de palavras:
 * qualquer conteúdo a mais ("confirmo que o problema continua") segue o fluxo normal.
 */
export function isBareConfirmation(message: string): boolean {
  const words = normalizeSearchText(message).match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.some((word) => CONFIRMATION_WORDS.has(word)) && words.every((word) => CONFIRMATION_WORDS.has(word) || CONFIRMATION_FILLERS.has(word));
}
