export const HERO_EYEBROW = "Service desk de TI da Nexo";

export const HERO_TITLE = "Seu problema de TI, resolvido em uma conversa.";

export const HERO_DESCRIPTION =
  "Descreva o que está acontecendo. O assistente consulta seus chamados, busca na central de ajuda e chama um analista quando precisa.";

export const HERO_PREVIEW = {
  label:
    "Exemplo de conversa em que o assistente abre o chamado INC-20517 para um problema de VPN.",
  userMessage: "Meu notebook não conecta na VPN. Erro 809.",
  agentName: "Nexo Assist",
  agentActions: ["consultou seus chamados", "criou um chamado"],
  agentMessage:
    "Pronto: abri o chamado com prioridade alta. Um analista fala com você em até 4 h úteis.",
  ticketNumber: "INC-20517",
  ticketSummary: "Rede e VPN · Alta · em até 4 h",
} as const;

export const HERO_STATS = [
  { value: "8 s", label: "primeira resposta, em média", online: false },
  { value: "72%", label: "resolvidos sem fila", online: false },
  { value: "6", label: "analistas online agora", online: true },
] as const;
