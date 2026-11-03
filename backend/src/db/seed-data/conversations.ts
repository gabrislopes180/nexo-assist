import type { ConversationStatus, HandoffReason, MessageAuthorType } from "../../generated/prisma/enums.js";
import type { AgentTrace } from "../../shared/transparency.js";
import { C2_HANDOFF_SUMMARY, C3_HANDOFF_SUMMARY } from "./tickets.js";
import { closeSystemMessage, RETURN_SYSTEM_MESSAGE, takeoverSystemMessage } from "../../conversations/attendance.js";
import { HANDOFF_SYSTEM_MESSAGE } from "../../conversations/handoff.js";
import { ago, formatLocalDateTime } from "./time.js";
import { USERS, type UserKey } from "./users.js";

export type ConversationKey = "C1" | "C2" | "C3" | "C4" | "C5" | "C6" | "C7" | "C8" | "C9";

function nameOf(key: UserKey): string {
  const user = USERS.find((candidate) => candidate.key === key);
  if (!user) throw new Error(`Usuário ${key} ausente`);
  return user.name;
}

/** Com 29 mensagens do funcionário: a próxima é a última aceita, e a seguinte é recusada. */
export const NEAR_LIMIT_CONVERSATION_ID = "seed-conv-near-limit";

export type MessageSeed = {
  at: Date;
  authorType: MessageAuthorType;
  authorKey: UserKey | null; // null para AGENT e SYSTEM
  content: string;
  trace?: AgentTrace; // só em mensagens do AGENT
};

export type ConversationSeed = {
  key: ConversationKey;
  /** Id fixo, para roteiros de demonstração. Sem ele, o banco gera um cuid. */
  id?: string;
  ownerKey: UserKey;
  status: ConversationStatus;
  analystKey?: UserKey;
  handoffReason?: HandoffReason;
  handoffSummary?: string;
  handoffAt?: Date;
  closedAt?: Date;
  /** Hora da SYSTEM de quem assumiu; mantida em CLOSED. */
  assignedAt?: Date;
  /** Hora da SYSTEM da devolução ao agent. */
  returnedToAgentAt?: Date;
  /** Em ordem cronológica. createdAt, lastMessageAt e messageCount são derivados daqui. */
  messages: MessageSeed[];
};

const NEAR_LIMIT_TOPICS = [
  { question: "como troco minha senha de rede", answer: "No portal de autoatendimento, em Segurança, use a opção Trocar senha." },
  { question: "qual é o prazo de um chamado de prioridade média", answer: "O prazo de um chamado de prioridade média é de 3 dias úteis." },
  { question: "como configuro a assinatura do e-mail", answer: "No Outlook, abra Configurações, E-mail e depois Assinaturas." },
  { question: "como peço acesso a uma pasta compartilhada", answer: "Peça pela abertura de um chamado do tipo REQ, categoria Acesso." },
] as const;

/** 29 perguntas respondidas, com um minuto entre cada mensagem. */
function nearLimitMessages(t: (a: Parameters<typeof ago>[0]) => Date): MessageSeed[] {
  const pairs = Array.from({ length: 29 }, (_, index) => index);
  return pairs.flatMap((index): MessageSeed[] => {
    const topic = NEAR_LIMIT_TOPICS[index % NEAR_LIMIT_TOPICS.length];
    if (!topic) throw new Error("Tópico ausente");
    const minutesAgo = 90 - index * 2;
    return [
      {
        at: t({ minutes: minutesAgo }),
        authorType: "EMPLOYEE",
        authorKey: "marina",
        content: `Dúvida ${index + 1}: ${topic.question}?`,
      },
      {
        at: t({ minutes: minutesAgo - 1 }),
        authorType: "AGENT",
        authorKey: null,
        content: topic.answer,
        trace: {
          understood: `A funcionária perguntou ${topic.question}.`,
          intent: "QUESTION",
          actions: [],
          confidence: "HIGH",
          reason: "Dúvida simples sobre um procedimento conhecido.",
        },
      },
    ];
  });
}

/**
 * Conversas da demo. `dueAtOf` devolve o prazo definido na criação do chamado,
 * usado no texto da confirmação do agent.
 */
export function buildConversations(now: Date, dueAtOf: (code: string) => Date): ConversationSeed[] {
  const t = (a: Parameters<typeof ago>[0]) => ago(a, now);

  return [
    {
      key: "C1",
      id: "seed-conv-closed",
      ownerKey: "marina",
      status: "CLOSED",
      closedAt: t({ hours: 1, minutes: 55 }),
      messages: [
        {
          at: t({ hours: 2, minutes: 5 }),
          authorType: "EMPLOYEE",
          authorKey: "marina",
          content:
            "O Outlook parou de sincronizar a caixa compartilhada do Comercial desde hoje cedo. Ninguém da equipe está recebendo os e-mails dela.",
        },
        {
          at: t({ hours: 2, minutes: 4 }),
          authorType: "AGENT",
          authorKey: null,
          content:
            "Não encontrei um artigo que resolva isso, então preparei um chamado:\n" +
            "• Tipo: INC (incidente)\n• Categoria: E-mail\n• Prioridade: Média\n" +
            "• Título: Outlook não sincroniza a caixa compartilhada do Comercial\n• Afetados: Equipe Comercial\n" +
            "Posso abrir?",
          trace: {
            understood: "A caixa compartilhada do Comercial não sincroniza no Outlook e afeta a equipe inteira.",
            intent: "OPEN_TICKET",
            actions: [
              { tool: "searchKnowledge", summary: "Buscou artigos sobre Outlook e caixa compartilhada; nenhum resolve o caso.", status: "SUCCESS" },
              { tool: "draftTicket", summary: "Preparou o rascunho de um INC de E-mail com prioridade Média.", status: "SUCCESS" },
            ],
            confidence: "HIGH",
            reason: "Falha de serviço que afeta uma equipe e não tem solução na central de ajuda; precisa de chamado.",
          },
        },
        { at: t({ hours: 2, minutes: 1 }), authorType: "EMPLOYEE", authorKey: "marina", content: "sim" },
        {
          at: t({ hours: 2 }),
          authorType: "AGENT",
          authorKey: null,
          content: `Chamado INC-20402 aberto. O prazo de atendimento é ${formatLocalDateTime(dueAtOf("INC-20402"))}.`,
          trace: {
            understood: "A funcionária confirmou o rascunho do chamado.",
            intent: "OPEN_TICKET",
            actions: [{ tool: "createTicket", summary: "Abriu o INC-20402 a partir do rascunho confirmado.", status: "SUCCESS" }],
            confidence: "HIGH",
            reason: "Confirmação explícita do rascunho pendente.",
          },
        },
      ],
    },
    {
      key: "C2",
      id: "seed-conv-waiting",
      ownerKey: "juliana",
      status: "WAITING_ANALYST",
      handoffReason: "CRITICAL",
      handoffSummary: C2_HANDOFF_SUMMARY,
      handoffAt: t({ minutes: 29 }),
      messages: [
        {
          at: t({ minutes: 33 }),
          authorType: "EMPLOYEE",
          authorKey: "juliana",
          content: "O sistema de ponto está fora do ar aqui na filial Campinas há uns 10 minutos. Ninguém consegue bater o ponto, somos umas 40 pessoas.",
        },
        {
          at: t({ minutes: 32 }),
          authorType: "AGENT",
          authorKey: null,
          content:
            "Isso parece um incidente crítico, porque afeta a filial inteira. Preparei um chamado:\n" +
            "• Tipo: INC (incidente)\n• Categoria: Software\n• Prioridade: Crítica\n" +
            "• Título: Sistema de ponto fora do ar na filial Campinas\n• Afetados: Filial Campinas, ~40 pessoas\n" +
            "Posso abrir? Se já testou outro navegador ou computador, me conte também.",
          trace: {
            understood: "Sistema de ponto indisponível para toda a filial Campinas.",
            intent: "OPEN_TICKET",
            actions: [{ tool: "draftTicket", summary: "Preparou o rascunho de um INC de Software com prioridade Crítica.", status: "SUCCESS" }],
            confidence: "HIGH",
            reason: "Sistema parado para cerca de 40 pessoas é incidente crítico.",
          },
        },
        {
          at: t({ minutes: 31 }),
          authorType: "EMPLOYEE",
          authorKey: "juliana",
          content: "Sim, pode abrir. Já testei outro navegador e outro computador, o erro é o mesmo.",
        },
        {
          at: t({ minutes: 29, seconds: 1 }),
          authorType: "AGENT",
          authorKey: null,
          content:
            "Chamado INC-20410 aberto como Crítica (prazo de 1 hora). Como é crítico, transferi a conversa para o plantão; um analista vai continuar por aqui.",
          trace: {
            understood: "A funcionária confirmou o chamado e já fez os testes básicos.",
            intent: "OPEN_TICKET",
            actions: [
              { tool: "createTicket", summary: "Abriu o INC-20410 com prioridade Crítica.", status: "SUCCESS" },
              { tool: "transferToAnalyst", summary: "Transferiu a conversa para um analista (motivo: crítico).", status: "SUCCESS" },
            ],
            confidence: "HIGH",
            reason: "Chamados críticos são sempre transferidos para um analista.",
          },
        },
        { at: t({ minutes: 29 }), authorType: "SYSTEM", authorKey: null, content: HANDOFF_SYSTEM_MESSAGE },
      ],
    },
    {
      key: "C3",
      ownerKey: "rafael",
      status: "WITH_ANALYST",
      analystKey: "bruno",
      handoffReason: "EMPLOYEE_REQUEST",
      handoffSummary: C3_HANDOFF_SUMMARY,
      handoffAt: t({ hours: 2, minutes: 55 }),
      assignedAt: t({ minutes: 40 }),
      messages: [
        {
          at: t({ hours: 3, minutes: 6 }),
          authorType: "EMPLOYEE",
          authorKey: "rafael",
          content: "Minha VPN está dando erro 809. Uso Windows 11.",
        },
        {
          at: t({ hours: 3, minutes: 5 }),
          authorType: "AGENT",
          authorKey: null,
          content:
            'Pela central de ajuda (artigo "VPN com erro 809"), reinstalar o cliente de VPN resolve apenas no Windows 10; no Windows 11 é preciso abrir um chamado. Preparei um:\n' +
            "• Tipo: INC (incidente)\n• Categoria: Rede e VPN\n• Prioridade: Alta\n• Título: VPN com erro 809 no Windows 11\n" +
            "Posso abrir?",
          trace: {
            understood: "Erro 809 na VPN em um computador com Windows 11.",
            intent: "OPEN_TICKET",
            actions: [
              { tool: "searchKnowledge", summary: 'Encontrou o artigo "VPN com erro 809"; ele manda abrir chamado no Windows 11.', status: "SUCCESS" },
              { tool: "draftTicket", summary: "Preparou o rascunho de um INC de Rede e VPN com prioridade Alta.", status: "SUCCESS" },
            ],
            confidence: "HIGH",
            reason: "O artigo da central de ajuda indica chamado para Windows 11.",
          },
        },
        { at: t({ hours: 3, minutes: 1 }), authorType: "EMPLOYEE", authorKey: "rafael", content: "sim" },
        {
          at: t({ hours: 3 }),
          authorType: "AGENT",
          authorKey: null,
          content: `Chamado INC-20405 aberto. O prazo de atendimento é ${formatLocalDateTime(dueAtOf("INC-20405"))}.`,
          trace: {
            understood: "O funcionário confirmou o rascunho do chamado.",
            intent: "OPEN_TICKET",
            actions: [{ tool: "createTicket", summary: "Abriu o INC-20405 a partir do rascunho confirmado.", status: "SUCCESS" }],
            confidence: "HIGH",
            reason: "Confirmação explícita do rascunho pendente.",
          },
        },
        {
          at: t({ hours: 2, minutes: 56 }),
          authorType: "EMPLOYEE",
          authorKey: "rafael",
          content: "Prefiro falar com um analista, preciso disso resolvido hoje.",
        },
        {
          at: t({ hours: 2, minutes: 55, seconds: 1 }),
          authorType: "AGENT",
          authorKey: null,
          content: "Transferi a conversa para um analista com um resumo do que já conversamos. Ele vai continuar por aqui.",
          trace: {
            understood: "O funcionário pediu para falar com um analista.",
            intent: "TALK_TO_ANALYST",
            actions: [{ tool: "transferToAnalyst", summary: "Transferiu a conversa (motivo: pedido do funcionário).", status: "SUCCESS" }],
            confidence: "HIGH",
            reason: "Pedido explícito para falar com uma pessoa.",
          },
        },
        { at: t({ hours: 2, minutes: 55 }), authorType: "SYSTEM", authorKey: null, content: HANDOFF_SYSTEM_MESSAGE },
        { at: t({ minutes: 40 }), authorType: "SYSTEM", authorKey: null, content: takeoverSystemMessage(nameOf("bruno")) },
        {
          at: t({ minutes: 38 }),
          authorType: "ANALYST",
          authorKey: "bruno",
          content: "Oi, Rafael! Vou acessar sua máquina remotamente para reconfigurar a VPN. Pode deixar o computador ligado?",
        },
      ],
    },
    {
      key: "C4",
      id: NEAR_LIMIT_CONVERSATION_ID,
      ownerKey: "marina",
      status: "WITH_AGENT",
      messages: nearLimitMessages(t),
    },
    {
      key: "C5",
      id: "seed-conv-request",
      ownerKey: "ana",
      status: "WAITING_ANALYST",
      handoffReason: "EMPLOYEE_REQUEST",
      handoffSummary: "Ana não consegue acessar a pasta compartilhada do Financeiro e prefere falar com um analista.",
      handoffAt: t({ minutes: 12 }),
      messages: [
        {
          at: t({ minutes: 15 }),
          authorType: "EMPLOYEE",
          authorKey: "ana",
          content: "Não consigo abrir a pasta compartilhada do Financeiro. Prefiro falar com alguém do suporte.",
        },
        {
          at: t({ minutes: 12, seconds: 1 }),
          authorType: "AGENT",
          authorKey: null,
          content: "Tudo bem, vou transferir a conversa para um analista com um resumo do que você contou.",
          trace: {
            understood: "A funcionária não acessa a pasta do Financeiro e pediu para falar com uma pessoa.",
            intent: "TALK_TO_ANALYST",
            actions: [{ tool: "transferToAnalyst", summary: "Transferiu a conversa (motivo: pedido do funcionário).", status: "SUCCESS" }],
            confidence: "HIGH",
            reason: "Pedido explícito para falar com uma pessoa.",
          },
        },
        { at: t({ minutes: 12 }), authorType: "SYSTEM", authorKey: null, content: HANDOFF_SYSTEM_MESSAGE },
      ],
    },
    {
      key: "C6",
      id: "seed-conv-low-confidence",
      ownerKey: "juliana",
      status: "WAITING_ANALYST",
      handoffReason: "LOW_CONFIDENCE",
      handoffSummary: "Juliana relata que o leitor de crachá da filial Campinas libera a entrada com atraso; não há artigo nem categoria clara.",
      handoffAt: t({ minutes: 20 }),
      messages: [
        {
          at: t({ minutes: 24 }),
          authorType: "EMPLOYEE",
          authorKey: "juliana",
          content: "O leitor de crachá da entrada da filial está demorando uns 30 segundos para liberar a porta.",
        },
        {
          at: t({ minutes: 20, seconds: 1 }),
          authorType: "AGENT",
          authorKey: null,
          content: "Não tenho certeza de como tratar isso pela central de ajuda, então vou passar para um analista.",
          trace: {
            understood: "Leitor de crachá lento na entrada da filial Campinas.",
            intent: "OTHER",
            actions: [
              { tool: "searchKnowledge", summary: "Buscou artigos sobre leitor de crachá; nenhum encontrado.", status: "SUCCESS" },
              { tool: "transferToAnalyst", summary: "Transferiu a conversa (motivo: baixa confiança).", status: "SUCCESS" },
            ],
            confidence: "LOW",
            reason: "Assunto fora da central de ajuda e sem categoria clara de chamado.",
          },
        },
        { at: t({ minutes: 20 }), authorType: "SYSTEM", authorKey: null, content: HANDOFF_SYSTEM_MESSAGE },
      ],
    },
    {
      key: "C7",
      id: "seed-conv-overdue",
      ownerKey: "marina",
      status: "WAITING_ANALYST",
      handoffReason: "OVERDUE",
      handoffSummary: "Marina perguntou pelo INC-20311 (notebook lento), que está com o prazo vencido, e aceitou falar com um analista.",
      handoffAt: t({ minutes: 5 }),
      messages: [
        { at: t({ minutes: 9 }), authorType: "EMPLOYEE", authorKey: "marina", content: "Como está o chamado do meu notebook lento?" },
        {
          at: t({ minutes: 8 }),
          authorType: "AGENT",
          authorKey: null,
          content: "O INC-20311 está aguardando analista e o prazo já venceu. Quer que eu transfira a conversa para um analista?",
          trace: {
            understood: "A funcionária quer saber do chamado do notebook lento.",
            intent: "CHECK_TICKET",
            actions: [{ tool: "searchMyOpenTickets", summary: "Encontrou o INC-20311, com prazo vencido.", status: "SUCCESS" }],
            confidence: "HIGH",
            reason: "Chamado único com o termo citado.",
          },
        },
        { at: t({ minutes: 6 }), authorType: "EMPLOYEE", authorKey: "marina", content: "Sim, por favor." },
        {
          at: t({ minutes: 5, seconds: 1 }),
          authorType: "AGENT",
          authorKey: null,
          content: "Transferi a conversa para um analista com um resumo do chamado.",
          trace: {
            understood: "A funcionária aceitou a transferência por causa do prazo vencido.",
            intent: "TALK_TO_ANALYST",
            actions: [{ tool: "transferToAnalyst", summary: "Transferiu a conversa (motivo: chamado vencido).", status: "SUCCESS" }],
            confidence: "HIGH",
            reason: "Aceite explícito da oferta de transferência.",
          },
        },
        { at: t({ minutes: 5 }), authorType: "SYSTEM", authorKey: null, content: HANDOFF_SYSTEM_MESSAGE },
      ],
    },
    {
      // Atendida pelo Bruno e devolvida: demonstra o agent retomando a mesma conversa.
      key: "C8",
      id: "seed-conv-returned",
      ownerKey: "ana",
      status: "WITH_AGENT",
      returnedToAgentAt: t({ minutes: 54 }),
      messages: [
        {
          at: t({ minutes: 70 }),
          authorType: "EMPLOYEE",
          authorKey: "ana",
          content: "A impressora do 3º andar não imprime meus relatórios: fica em fila e nada sai. Pode chamar alguém do suporte?",
        },
        {
          at: t({ minutes: 69, seconds: 1 }),
          authorType: "AGENT",
          authorKey: null,
          content: "Claro, vou transferir a conversa para um analista com um resumo do que você contou.",
          trace: {
            understood: "A impressora do 3º andar não imprime e a funcionária pediu para falar com uma pessoa.",
            intent: "TALK_TO_ANALYST",
            actions: [{ tool: "transferToAnalyst", summary: "Transferiu a conversa (motivo: pedido do funcionário).", status: "SUCCESS" }],
            confidence: "HIGH",
            reason: "Pedido explícito para falar com uma pessoa.",
          },
        },
        { at: t({ minutes: 69 }), authorType: "SYSTEM", authorKey: null, content: HANDOFF_SYSTEM_MESSAGE },
        { at: t({ minutes: 60 }), authorType: "SYSTEM", authorKey: null, content: takeoverSystemMessage(nameOf("bruno")) },
        {
          at: t({ minutes: 58 }),
          authorType: "ANALYST",
          authorKey: "bruno",
          content: "Oi, Ana! Reiniciei a fila de impressão do 3º andar. Pode tentar imprimir de novo?",
        },
        { at: t({ minutes: 55 }), authorType: "EMPLOYEE", authorKey: "ana", content: "Agora saiu, obrigada!" },
        { at: t({ minutes: 54 }), authorType: "SYSTEM", authorKey: null, content: RETURN_SYSTEM_MESSAGE },
      ],
    },
    {
      // Encerrada pelo analista há 3 h: aparece na lista do console dentro da janela de 48 h.
      key: "C9",
      id: "seed-conv-closed-by-analyst",
      ownerKey: "juliana",
      status: "CLOSED",
      analystKey: "rafael",
      handoffReason: "EMPLOYEE_REQUEST",
      handoffSummary: "Juliana precisa instalar um leitor de PDF e não tem permissão de administrador; pediu para falar com um analista.",
      handoffAt: t({ hours: 3, minutes: 39 }),
      assignedAt: t({ hours: 3, minutes: 30 }),
      closedAt: t({ hours: 3 }),
      messages: [
        {
          at: t({ hours: 3, minutes: 40 }),
          authorType: "EMPLOYEE",
          authorKey: "juliana",
          content: "Preciso instalar um leitor de PDF, mas o computador pede senha de administrador. Pode chamar um analista?",
        },
        {
          at: t({ hours: 3, minutes: 39, seconds: 1 }),
          authorType: "AGENT",
          authorKey: null,
          content: "Tudo bem, vou transferir a conversa para um analista com um resumo do pedido.",
          trace: {
            understood: "A funcionária precisa instalar um programa sem permissão de administrador e pediu um analista.",
            intent: "TALK_TO_ANALYST",
            actions: [{ tool: "transferToAnalyst", summary: "Transferiu a conversa (motivo: pedido do funcionário).", status: "SUCCESS" }],
            confidence: "HIGH",
            reason: "Pedido explícito para falar com uma pessoa.",
          },
        },
        { at: t({ hours: 3, minutes: 39 }), authorType: "SYSTEM", authorKey: null, content: HANDOFF_SYSTEM_MESSAGE },
        { at: t({ hours: 3, minutes: 30 }), authorType: "SYSTEM", authorKey: null, content: takeoverSystemMessage(nameOf("rafael")) },
        {
          at: t({ hours: 3, minutes: 28 }),
          authorType: "ANALYST",
          authorKey: "rafael",
          content: "Oi, Juliana! Liberei o leitor de PDF no Portal de Software. Ele já aparece para você instalar por lá.",
        },
        { at: t({ hours: 3, minutes: 10 }), authorType: "EMPLOYEE", authorKey: "juliana", content: "Apareceu e já instalei. Obrigada!" },
        { at: t({ hours: 3 }), authorType: "SYSTEM", authorKey: null, content: closeSystemMessage(nameOf("rafael")) },
      ],
    },
  ];
}
