import type { TicketCategory } from "../../generated/prisma/enums.js";

export type ArticleSeed = { slug: string; title: string; category: TicketCategory; content: string; keywords: string[] };

// Os dois primeiros têm o texto literal do PRD.
export const ARTICLES: readonly ArticleSeed[] = [
  {
    slug: "vpn-erro-809",
    title: "VPN com erro 809",
    category: "NETWORK_VPN",
    content:
      "VPN com erro 809: reinstale o cliente de VPN pelo portal de softwares e reinicie o computador. Vale apenas para Windows 10; no Windows 11, abra um chamado.",
    keywords: ["vpn", "erro 809", "809", "conexão", "windows 10", "home office"],
  },
  {
    slug: "horario-service-desk",
    title: "Horário do service desk",
    category: "OTHER",
    content: "Horário do service desk: de segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas.",
    keywords: ["horário", "atendimento", "plantão", "suporte", "service desk"],
  },
  {
    slug: "redefinir-senha-rede",
    title: "Como redefinir a senha de rede",
    category: "ACCESS",
    content: 'Use "Esqueci minha senha" no portal de autoatendimento; a nova senha vale para Windows, e-mail e VPN.',
    keywords: ["senha", "rede", "windows", "esqueci", "redefinir"],
  },
  {
    slug: "senha-sap-bloqueada",
    title: "Senha do SAP bloqueada",
    category: "ACCESS",
    content:
      'Após 3 tentativas erradas o SAP bloqueia a conta por 30 minutos; depois disso use "Redefinir senha" na tela de login. Se continuar bloqueada, abra um chamado.',
    keywords: ["sap", "senha", "bloqueio", "bloqueada"],
  },
  {
    slug: "email-celular",
    title: "Configurar o e-mail corporativo no celular",
    category: "EMAIL",
    content: "Instale o Outlook, entre com o e-mail corporativo e aprove o acesso no app autenticador.",
    keywords: ["e-mail", "outlook", "celular", "sincronizar"],
  },
  {
    slug: "impressora-nao-imprime",
    title: "Impressora não imprime",
    category: "HARDWARE",
    content: "Confira se a impressora certa está selecionada, cancele os trabalhos presos na fila e desligue e ligue a impressora.",
    keywords: ["impressora", "imprimir", "fila"],
  },
  {
    slug: "notebook-lento-atualizacao",
    title: "Notebook lento após atualização do Windows",
    category: "HARDWARE",
    content:
      "Reinicie duas vezes para concluir a atualização e libere espaço em disco (mínimo 15 GB). Se continuar lento, abra um chamado.",
    keywords: ["notebook", "lento", "lentidão", "atualização", "windows"],
  },
  {
    slug: "solicitar-software",
    title: "Como solicitar um software",
    category: "SOFTWARE",
    content: "Softwares gratuitos estão no portal de softwares; licenças pagas exigem um chamado do tipo REQ com aprovação do gestor.",
    keywords: ["software", "instalar", "licença", "portal"],
  },
];
