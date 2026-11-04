import type { ArticleSource } from "../model/agent-sources";

const NOTE_START = "Fonte: ";
/** A mesma frase que o backend acrescenta (`articleNote`), com qualquer título. */
const ANY_SOURCE_NOTE = /^Fonte: [^\n]+ \(central de ajuda\)\.$/u;

const noteFor = (title: string) => `${NOTE_START}${title} (central de ajuda).`;

/** Onde começa a frase que fecha o texto, logo depois de um espaço; -1 se não houver. */
function noteStart(text: string, sources: readonly ArticleSource[]): number {
  const startsAfterSpace = (start: number) =>
    start > 0 && /\s/u.test(text[start - 1] ?? "");

  for (const { title } of sources) {
    const note = noteFor(title);
    const start = text.length - note.length;
    if (text.endsWith(note) && startsAfterSpace(start)) return start;
  }
  // Só a última "Fonte: " conta: uma frase igual no meio do texto fica.
  const start = text.lastIndexOf(NOTE_START);
  return startsAfterSpace(start) && ANY_SOURCE_NOTE.test(text.slice(start))
    ? start
    : -1;
}

/**
 * Esconde a frase "Fonte: <título> (central de ajuda)." do fim da resposta do
 * agent: quem mostra a fonte é o card do artigo. Só com fonte no trace, só no
 * fim do texto e nunca deixando a bolha vazia; o resto do texto não muda.
 */
export function stripSourceNote(
  content: string,
  sources: readonly ArticleSource[] | undefined,
): string {
  if (!sources || sources.length === 0) return content;

  const text = content.trimEnd();
  const start = noteStart(text, sources);
  if (start === -1) return content;

  const kept = text.slice(0, start).trimEnd();
  return kept.trim() === "" ? content : kept;
}
