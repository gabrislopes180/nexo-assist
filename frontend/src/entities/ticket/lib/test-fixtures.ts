// Só para *.test.ts: nunca importe em código de produção.
import type { ConsoleTicket } from "../model/console-ticket";
import type {
  ConsoleTicketDetail,
  ConsoleTicketEvent,
} from "../model/console-ticket-detail";

export function buildConsoleTicket(
  overrides: Partial<ConsoleTicket> = {},
): ConsoleTicket {
  return {
    code: "INC-20405",
    type: "INC",
    category: "NETWORK_VPN",
    priority: "HIGH",
    status: "WAITING_ANALYST",
    statusLabel: "Aguardando analista",
    title: "VPN cai a cada 10 minutos",
    createdAt: "2026-11-03T09:40:00.000Z",
    resolvedAt: null,
    dueAt: "2026-11-03T13:40:00.000Z",
    overdue: false,
    ...overrides,
  };
}

export function buildTicketEvent(
  overrides: Partial<ConsoleTicketEvent> = {},
): ConsoleTicketEvent {
  return {
    id: "ev-1",
    type: "CREATED",
    actorType: "EMPLOYEE",
    actor: { id: "u-ana", name: "Ana Souza" },
    content: null,
    fromStatus: null,
    toStatus: null,
    fromPriority: null,
    toPriority: null,
    dueAt: null,
    conversationId: "c-ana",
    createdAt: "2026-11-03T09:40:00.000Z",
    ...overrides,
  };
}

export function buildTicketDetail(
  overrides: Partial<ConsoleTicketDetail> = {},
): ConsoleTicketDetail {
  return {
    ...buildConsoleTicket(),
    description: "Desde ontem a VPN cai.\nJá reiniciei o notebook.",
    affectedScope: "INDIVIDUAL",
    affectedDescription: null,
    owner: { id: "u-ana", name: "Ana Souza", department: "Financeiro" },
    updatedAt: "2026-11-03T09:40:00.000Z",
    slaStartedAt: "2026-11-03T09:40:00.000Z",
    slaPaused: false,
    allowedStatuses: ["IN_PROGRESS", "WAITING_EMPLOYEE", "RESOLVED"],
    statusNoteRequired: ["WAITING_EMPLOYEE", "RESOLVED"],
    events: [buildTicketEvent()],
    ...overrides,
  };
}
