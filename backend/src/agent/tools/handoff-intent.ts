import { normalizeSearchText } from "../../knowledge/search-text.js";

/**
 * Leitura determinística da mensagem atual para a transferência: o modelo decide chamar a tool,
 * mas pedido, recusa e aceite do usuário são conferidos aqui, sem depender da interpretação dele.
 */

const PERSON = "(?:analista|analistas|atendente|humano|humana|pessoa|tecnico|tecnica)";
const ARTICLE = "(?:(?:um|uma|o|a)\\s+)?";
const REQUESTS = [
  `(?:falar|conversar)\\s+com\\s+${ARTICLE}${PERSON}`,
  `(?:passa|passar|passe|transfere|transferir|transfira|encaminha|encaminhar|manda|mandar)\\s+(?:\\p{L}+\\s+){0,2}?(?:para|pra|pro)\\s+${ARTICLE}${PERSON}`,
  `(?:chama|chame|chamar|quero|queria|preciso\\s+de|preciso\\s+falar\\s+com)\\s+${ARTICLE}${PERSON}`,
].map((pattern) => new RegExp(`(?<!\\p{L})${pattern}(?!\\p{L})`, "u"));

/** Negação colada ao pedido, na mesma oração: "não quero falar com analista". */
const NEGATION_BEFORE = /(?<!\p{L})(?:nao|nunca|nem)\s+(?:\p{L}+\s+)?$/u;
/** Só respostas curtas: "Não consigo acessar a VPN" começa com "não", mas é relato, não recusa. */
const SHORT_REPLY_WORDS = 3;
const DECLINE_START = /^(?:nao|nunca|dispenso|depois|deixa|deixe|agora nao|pode deixar|obrigad[oa]|ta bom|tudo bem)(?!\p{L})/u;
const DECLINE_ANYWHERE =
  /(?<!\p{L})(?:nao precisa|agora nao|pode deixar|nao quero|nao obrigad[oa]|depois eu vejo|claro que nao|por favor nao|dispenso)(?!\p{L})/u;

/** Aceite curto: só estas palavras, com pelo menos uma de aceite. "quero saber quando vence" tem conteúdo e não é aceite. */
const ACCEPT_WORDS: ReadonlySet<string> = new Set("sim pode quero claro chama chame chamar isso confirmo confirma confirmar confirmado".split(" "));
const ACCEPT_FILLERS: ReadonlySet<string> = new Set("ok okay tudo bem ta bom obrigado obrigada por favor pf entao um uma o a me analista atendente".split(" "));

function clausesOf(message: string): string[] {
  return normalizeSearchText(message)
    .split(/[.,;:!?\n]+/)
    .map((clause) => clause.trim())
    .filter((clause) => clause !== "");
}

function wordsOf(message: string): string[] {
  return normalizeSearchText(message).match(/[\p{L}\p{N}]+/gu) ?? [];
}

function requestMatches(message: string): { negated: boolean }[] {
  return clausesOf(message).flatMap((clause) =>
    REQUESTS.flatMap((pattern) => {
      const match = pattern.exec(clause);
      return match ? [{ negated: NEGATION_BEFORE.test(clause.slice(0, match.index)) }] : [];
    }),
  );
}

export function asksForPerson(message: string): boolean {
  return requestMatches(message).some(({ negated }) => !negated);
}

function isShortAccept(message: string): boolean {
  const words = wordsOf(message);
  return words.some((word) => ACCEPT_WORDS.has(word)) && words.every((word) => ACCEPT_WORDS.has(word) || ACCEPT_FILLERS.has(word));
}

/** Recusa de falar com alguém. Um pedido explícito, ou um aceite curto, na mesma mensagem vence a palavra "não". */
export function declinesPerson(message: string): boolean {
  if (asksForPerson(message)) return false;
  if (requestMatches(message).some(({ negated }) => negated)) return true;
  const text = clausesOf(message).join(" ");
  if (DECLINE_ANYWHERE.test(text)) return true;
  if (isShortAccept(message)) return false;
  return wordsOf(message).length <= SHORT_REPLY_WORDS && DECLINE_START.test(text);
}

/** Aceite da oferta: pedido explícito ou resposta curta de aceite ("sim", "Tudo bem, pode chamar", "Sim, confirmo"). */
export function acceptsOffer(message: string): boolean {
  if (asksForPerson(message)) return true;
  if (declinesPerson(message)) return false;
  return isShortAccept(message);
}
