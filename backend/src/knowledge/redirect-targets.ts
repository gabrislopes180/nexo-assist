/**
 * Áreas fora de TI para onde o agent encaminha o funcionário.
 * O texto e os contatos saem daqui, nunca do modelo: ele só escolhe a área.
 * Contatos fictícios (domínio nexo.example).
 */
export const REDIRECT_AREAS = ["RH", "FINANCEIRO", "FACILITIES"] as const;
export type RedirectArea = (typeof REDIRECT_AREAS)[number];

type RedirectTarget = {
  /** Como a área entra nas frases, com artigo: "Isso é com o RH.", "Encaminhado para Facilities." */
  withArticle: string;
  /** Exemplos de assunto, também usados nas instruções do agent. */
  covers: readonly string[];
  /** Fim da frase "Fale com eles ...". */
  channel: string;
};

export const REDIRECT_TARGETS: Record<RedirectArea, RedirectTarget> = {
  RH: {
    withArticle: "o RH",
    covers: ["férias", "holerite", "benefícios", "ponto", "admissão e desligamento"],
    channel: "pelo Portal do Colaborador (menu RH) ou em rh@nexo.example",
  },
  FINANCEIRO: {
    withArticle: "o Financeiro",
    covers: ["reembolsos", "notas fiscais", "pagamentos"],
    channel: "em financeiro@nexo.example",
  },
  FACILITIES: {
    withArticle: "Facilities",
    covers: ["manutenção predial", "ar-condicionado", "reserva de salas", "crachá físico e porta que não abre", "limpeza"],
    channel: "em facilities@nexo.example ou pelo ramal 2200",
  },
};

export function redirectReply(area: RedirectArea): string {
  const { withArticle, channel } = REDIRECT_TARGETS[area];
  return `Isso é com ${withArticle}. Fale com eles ${channel}.`;
}

/** Linha do trace para a ação de encaminhamento. */
export function redirectSummary(area: RedirectArea): string {
  return `Encaminhado para ${REDIRECT_TARGETS[area].withArticle}.`;
}
