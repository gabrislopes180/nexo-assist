export interface SplitQuestion {
  text: string;
  question: string | null;
}

/**
 * Com respostas rápidas, a pergunta final vira a linha em destaque acima delas,
 * como no protótipo ("Quem está sendo afetado?").
 */
export function splitQuestion(content: string): SplitQuestion {
  const trimmed = content.trimEnd();
  const breakAt = trimmed.lastIndexOf("\n");
  if (breakAt === -1) return { text: content, question: null };

  const lastLine = trimmed.slice(breakAt + 1).trim();
  const text = trimmed.slice(0, breakAt).trimEnd();
  if (!lastLine.endsWith("?") || text === "") {
    return { text: content, question: null };
  }
  return { text, question: lastLine };
}
