import type {
  ActorType,
  AffectedScope,
  TicketCategory,
  TicketEventType,
  TicketPriority,
  TicketStatus,
  TicketType,
} from "../../generated/prisma/enums.js";
import type { ConversationKey } from "./conversations.js";
import { ago } from "./time.js";
import type { UserKey } from "./users.js";

export type TicketEventSeed = {
  at: Date;
  type: TicketEventType;
  actorType: ActorType;
  actorKey: UserKey | null; // null para AGENT e SYSTEM
  content?: string;
  toStatus?: TicketStatus;
  toPriority?: TicketPriority;
  conversationKey?: ConversationKey;
};

export type TicketSeed = {
  code: string;
  type: TicketType;
  ownerKey: UserKey;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  affectedScope: AffectedScope;
  affectedDescription?: string;
  /** Em ordem cronológica; o primeiro é sempre CREATED. */
  events: TicketEventSeed[];
};

export const C2_HANDOFF_SUMMARY =
  "Sistema de ponto fora do ar para toda a filial Campinas desde cerca de 10 minutos antes do contato; INC-20410 aberto como Crítica; já testou outro navegador e outro computador.";

export const C3_HANDOFF_SUMMARY =
  "Rafael está com erro 809 na VPN no Windows 11; o artigo da central de ajuda vale só para Windows 10. INC-20405 aberto como Alta. Pediu para falar com um analista.";

/**
 * Chamados da demo, com tempos relativos a `now`. O estado final (status, prazo,
 * resolvedAt) não é escrito aqui: o seed o obtém reaplicando os eventos com as
 * regras de ticket-rules.ts.
 */
export function buildTickets(now: Date): TicketSeed[] {
  const t = (a: Parameters<typeof ago>[0]) => ago(a, now);

  return [
    {
      code: "INC-20311",
      type: "INC",
      ownerKey: "marina",
      title: "Notebook lento após atualização do Windows",
      description: "Depois da última atualização do Windows o notebook ficou muito lento para abrir programas e arquivos.",
      category: "HARDWARE",
      priority: "MEDIUM",
      affectedScope: "INDIVIDUAL",
      events: [
        { at: t({ days: 8 }), type: "CREATED", actorType: "EMPLOYEE", actorKey: "marina" },
        {
          at: t({ days: 6 }),
          type: "COMMENT",
          actorType: "EMPLOYEE",
          actorKey: "marina",
          content: "Mesmo após reiniciar, o Excel leva uns 10 minutos para abrir.",
        },
      ],
    },
    {
      code: "REQ-10442",
      type: "REQ",
      ownerKey: "marina",
      title: "Segundo monitor para home office",
      description: "Solicito um segundo monitor para trabalhar em casa; uso planilhas e CRM ao mesmo tempo.",
      category: "HARDWARE",
      priority: "LOW",
      affectedScope: "INDIVIDUAL",
      events: [
        { at: t({ days: 12 }), type: "CREATED", actorType: "EMPLOYEE", actorKey: "marina" },
        {
          at: t({ days: 7, hours: 2 }),
          type: "STATUS_CHANGED",
          actorType: "ANALYST",
          actorKey: "bruno",
          toStatus: "APPROVED",
          content: "Aprovado pelo gestor; aguardando chegada do equipamento.",
        },
      ],
    },
    {
      code: "INC-20150",
      type: "INC",
      ownerKey: "marina",
      title: "Senha do SAP bloqueada",
      description: "Minha conta do SAP foi bloqueada e continua bloqueada mesmo depois de 30 minutos.",
      category: "ACCESS",
      priority: "MEDIUM",
      affectedScope: "INDIVIDUAL",
      events: [
        { at: t({ days: 6 }), type: "CREATED", actorType: "EMPLOYEE", actorKey: "marina" },
        { at: t({ days: 5 }), type: "STATUS_CHANGED", actorType: "ANALYST", actorKey: "ana", toStatus: "IN_PROGRESS" },
        {
          at: t({ days: 4 }),
          type: "STATUS_CHANGED",
          actorType: "ANALYST",
          actorKey: "ana",
          toStatus: "RESOLVED",
          content: "Conta desbloqueada e senha redefinida.",
        },
      ],
    },
    {
      code: "INC-19987",
      type: "INC",
      ownerKey: "marina",
      title: "VPN desconecta a cada 10 minutos",
      description: "A VPN cai a cada 10 minutos quando trabalho de casa e preciso reconectar.",
      category: "NETWORK_VPN",
      priority: "HIGH",
      affectedScope: "INDIVIDUAL",
      events: [
        { at: t({ days: 15 }), type: "CREATED", actorType: "EMPLOYEE", actorKey: "marina" },
        { at: t({ days: 14, hours: 23 }), type: "STATUS_CHANGED", actorType: "ANALYST", actorKey: "ana", toStatus: "IN_PROGRESS" },
        {
          at: t({ days: 12 }),
          type: "STATUS_CHANGED",
          actorType: "ANALYST",
          actorKey: "ana",
          toStatus: "RESOLVED",
          content: "Driver da placa de rede atualizado.",
        },
      ],
    },
    {
      code: "INC-20402",
      type: "INC",
      ownerKey: "marina",
      title: "Outlook não sincroniza a caixa compartilhada do Comercial",
      description: "A caixa compartilhada do Comercial parou de sincronizar no Outlook hoje cedo; a equipe não recebe os e-mails dela.",
      category: "EMAIL",
      priority: "MEDIUM",
      affectedScope: "TEAM",
      affectedDescription: "Equipe Comercial",
      events: [{ at: t({ hours: 2 }), type: "CREATED", actorType: "EMPLOYEE", actorKey: "marina", conversationKey: "C1" }],
    },
    {
      code: "INC-20398",
      type: "INC",
      ownerKey: "rafael",
      title: "Impressora do Financeiro não imprime frente e verso",
      description: "A impressora do Financeiro imprime normalmente, mas a opção frente e verso não funciona para ninguém da equipe.",
      category: "HARDWARE",
      priority: "LOW",
      affectedScope: "TEAM",
      affectedDescription: "Equipe Financeiro",
      events: [
        { at: t({ days: 3 }), type: "CREATED", actorType: "EMPLOYEE", actorKey: "rafael" },
        {
          at: t({ days: 2 }),
          type: "STATUS_CHANGED",
          actorType: "ANALYST",
          actorKey: "ana",
          toStatus: "WAITING_EMPLOYEE",
          content: "Pode informar o andar e o modelo da impressora?",
        },
      ],
    },
    {
      code: "INC-20405",
      type: "INC",
      ownerKey: "rafael",
      title: "VPN com erro 809 no Windows 11",
      description: "A VPN retorna erro 809 ao conectar; o computador usa Windows 11, então o artigo da central de ajuda não se aplica.",
      category: "NETWORK_VPN",
      priority: "HIGH",
      affectedScope: "INDIVIDUAL",
      events: [
        { at: t({ hours: 3 }), type: "CREATED", actorType: "EMPLOYEE", actorKey: "rafael", conversationKey: "C3" },
        {
          at: t({ hours: 2, minutes: 55 }),
          type: "TRANSFERRED",
          actorType: "AGENT",
          actorKey: null,
          content: C3_HANDOFF_SUMMARY,
          conversationKey: "C3",
        },
        { at: t({ minutes: 35 }), type: "STATUS_CHANGED", actorType: "ANALYST", actorKey: "bruno", toStatus: "IN_PROGRESS" },
      ],
    },
    {
      code: "INC-20410",
      type: "INC",
      ownerKey: "juliana",
      title: "Sistema de ponto fora do ar na filial Campinas",
      description: "O sistema de ponto não abre para ninguém da filial Campinas; já foi testado em outro navegador e outro computador.",
      category: "SOFTWARE",
      priority: "CRITICAL",
      affectedScope: "TEAM",
      affectedDescription: "Filial Campinas, ~40 pessoas",
      events: [
        { at: t({ minutes: 30 }), type: "CREATED", actorType: "EMPLOYEE", actorKey: "juliana", conversationKey: "C2" },
        {
          at: t({ minutes: 29 }),
          type: "TRANSFERRED",
          actorType: "AGENT",
          actorKey: null,
          content: C2_HANDOFF_SUMMARY,
          conversationKey: "C2",
        },
      ],
    },
    {
      code: "REQ-10460",
      type: "REQ",
      ownerKey: "juliana",
      title: "Licença do Power BI Pro",
      description: "Preciso publicar relatórios para a diretoria.",
      category: "SOFTWARE",
      priority: "LOW",
      affectedScope: "INDIVIDUAL",
      events: [{ at: t({ days: 1 }), type: "CREATED", actorType: "EMPLOYEE", actorKey: "juliana" }],
    },
  ];
}
