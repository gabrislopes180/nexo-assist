import type {
  ActorType,
  TicketCategory,
  TicketEventType,
  TicketPriority,
  TicketStatus,
  TicketType,
} from "../generated/prisma/enums.js";
import { computeDueAt } from "./sla.js";

/**
 * Regras de chamados (módulo puro). Fonte única para status, transições e prazo:
 * serviços e seed aplicam eventos por aqui e gravam o resultado.
 */

export const OPEN_STATUSES = [
  "WAITING_ANALYST",
  "IN_PROGRESS",
  "WAITING_EMPLOYEE",
  "APPROVED",
] as const satisfies readonly TicketStatus[];

export function isOpen(ticket: { status: TicketStatus }): boolean {
  return (OPEN_STATUSES as readonly TicketStatus[]).includes(ticket.status);
}

export const REOPEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function canReopen(ticket: { status: TicketStatus; resolvedAt: Date | null }, now: Date): boolean {
  return (
    ticket.status === "RESOLVED" &&
    ticket.resolvedAt !== null &&
    now.getTime() - ticket.resolvedAt.getTime() <= REOPEN_WINDOW_MS
  );
}

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  WAITING_ANALYST: "Aguardando analista",
  IN_PROGRESS: "Em andamento",
  WAITING_EMPLOYEE: "Aguardando funcionário",
  APPROVED: "Aprovado",
  RESOLVED: "Resolvido",
};

export const TICKET_CATEGORY_LABEL: Record<TicketCategory, string> = {
  ACCESS: "Acesso",
  NETWORK_VPN: "Rede e VPN",
  HARDWARE: "Hardware",
  SOFTWARE: "Software",
  EMAIL: "E-mail",
  OTHER: "Outros",
};

export const TICKET_PRIORITY_LABEL: Record<TicketPriority, string> = {
  CRITICAL: "Crítica",
  HIGH: "Alta",
  MEDIUM: "Média",
  LOW: "Baixa",
};

export const TICKET_TYPE_LABEL: Record<TicketType, string> = {
  INC: "Incidente",
  REQ: "Requisição",
};

/** Ordem de urgência: CRITICAL > HIGH > MEDIUM > LOW (menor índice = mais urgente). */
const PRIORITY_URGENCY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const satisfies readonly TicketPriority[];

function isMoreUrgent(a: TicketPriority, b: TicketPriority): boolean {
  return PRIORITY_URGENCY_ORDER.indexOf(a) < PRIORITY_URGENCY_ORDER.indexOf(b);
}

export class InvalidTicketTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTicketTransitionError";
  }
}

/** Transições de status feitas por um analista (STATUS_CHANGED). */
const ANALYST_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  WAITING_ANALYST: ["IN_PROGRESS", "WAITING_EMPLOYEE", "APPROVED", "RESOLVED"],
  IN_PROGRESS: ["WAITING_EMPLOYEE", "APPROVED", "RESOLVED"],
  WAITING_EMPLOYEE: ["IN_PROGRESS", "RESOLVED"],
  APPROVED: ["IN_PROGRESS", "WAITING_EMPLOYEE", "RESOLVED"],
  RESOLVED: [], // só sai por REOPENED
};

/**
 * Pode mudar de `from` para `to` via STATUS_CHANGED?
 * ANALYST segue a tabela acima (APPROVED só em REQ). SYSTEM só devolve à fila
 * um chamado em WAITING_EMPLOYEE depois da resposta do funcionário.
 */
export function canTransition(
  type: TicketType,
  from: TicketStatus,
  to: TicketStatus,
  actorType: ActorType = "ANALYST",
): boolean {
  if (actorType === "SYSTEM") return from === "WAITING_EMPLOYEE" && to === "WAITING_ANALYST";
  if (actorType !== "ANALYST") return false;
  if (to === "APPROVED" && type !== "REQ") return false;
  return ANALYST_TRANSITIONS[from].includes(to);
}

export type TicketTimeline = {
  type: TicketType;
  status: TicketStatus;
  priority: TicketPriority;
  slaStartedAt: Date | null;
  dueAt: Date | null;
  resolvedAt: Date | null;
  updatedAt: Date;
};

export type TicketEventInput = {
  type: TicketEventType;
  actorType: ActorType;
  at: Date;
  toStatus?: TicketStatus;
  toPriority?: TicketPriority;
};

export type TimelineResult = {
  next: TicketTimeline;
  /** Prazo definido por este evento (grava em TicketEvent.dueAt); null se o evento não mexeu no prazo. */
  eventDueAt: Date | null;
};

export type ApplyResult = TimelineResult & {
  fromStatus: TicketStatus | null;
  fromPriority: TicketPriority | null;
};

/** Estado de um chamado recém-criado (evento CREATED). */
export function initialTimeline(input: { type: TicketType; priority: TicketPriority; at: Date }): TimelineResult {
  const dueAt = computeDueAt(input.priority, input.at);
  return {
    next: {
      type: input.type,
      status: "WAITING_ANALYST",
      priority: input.priority,
      slaStartedAt: input.at,
      dueAt,
      resolvedAt: null,
      updatedAt: input.at,
    },
    eventDueAt: dueAt,
  };
}

/** Nova janela de prazo começando em `at`. */
function renewed(state: TicketTimeline, at: Date): Pick<TicketTimeline, "slaStartedAt" | "dueAt"> {
  return { slaStartedAt: at, dueAt: computeDueAt(state.priority, at) };
}

/**
 * Aplica um evento ao estado do chamado e devolve o novo estado (não altera a entrada).
 * `now` é usado para a janela de reabertura; ao reaplicar histórico, passe `event.at`.
 * Lança InvalidTicketTransitionError quando o evento não é permitido.
 */
export function applyTicketEvent(state: TicketTimeline, event: TicketEventInput, now: Date): ApplyResult {
  const { at } = event;
  const base: TicketTimeline = { ...state, updatedAt: at };
  const unchanged = (): ApplyResult => ({ next: base, eventDueAt: null, fromStatus: null, fromPriority: null });

  switch (event.type) {
    case "CREATED":
      throw new InvalidTicketTransitionError("CREATED só pode ser o primeiro evento (use initialTimeline)");

    case "STATUS_CHANGED": {
      const to = event.toStatus;
      if (to === undefined) throw new InvalidTicketTransitionError("STATUS_CHANGED exige toStatus");
      if (!canTransition(state.type, state.status, to, event.actorType)) {
        throw new InvalidTicketTransitionError(
          `Transição não permitida para ${event.actorType}: ${state.status} -> ${to} (${state.type})`,
        );
      }
      const fromStatus = state.status;
      if (to === "RESOLVED") {
        return {
          next: { ...base, status: to, resolvedAt: at, slaStartedAt: null, dueAt: null },
          eventDueAt: null,
          fromStatus,
          fromPriority: null,
        };
      }
      if (to === "WAITING_EMPLOYEE") {
        return {
          next: { ...base, status: to, slaStartedAt: null, dueAt: null },
          eventDueAt: null,
          fromStatus,
          fromPriority: null,
        };
      }
      // IN_PROGRESS, APPROVED ou WAITING_ANALYST (devolução automática): nova janela.
      const window = renewed(state, at);
      return { next: { ...base, status: to, ...window }, eventDueAt: window.dueAt, fromStatus, fromPriority: null };
    }

    case "COMMENT": {
      if (!isOpen(state)) {
        throw new InvalidTicketTransitionError("Chamado resolvido não aceita comentário; reabra o chamado");
      }
      // Só o analista renova; com o prazo pausado (WAITING_EMPLOYEE) nada muda.
      if (event.actorType !== "ANALYST" || state.status === "WAITING_EMPLOYEE") return unchanged();
      const window = renewed(state, at);
      return { next: { ...base, ...window }, eventDueAt: window.dueAt, fromStatus: null, fromPriority: null };
    }

    case "PRIORITY_CHANGED": {
      const to = event.toPriority;
      if (to === undefined) throw new InvalidTicketTransitionError("PRIORITY_CHANGED exige toPriority");
      if (!isOpen(state)) throw new InvalidTicketTransitionError("Chamado resolvido não muda de prioridade");
      if (to === state.priority) throw new InvalidTicketTransitionError(`Prioridade já é ${to}`);
      const fromPriority = state.priority;
      // Prazo pausado (WAITING_EMPLOYEE): só a prioridade muda.
      if (state.slaStartedAt === null || state.dueAt === null) {
        return { next: { ...base, priority: to }, eventDueAt: null, fromStatus: null, fromPriority };
      }
      // Elevar nunca adia o prazo atual (nem "desvence") e não cria prazo já vencido no ato;
      // a janela (slaStartedAt) continua a mesma. Rebaixar recalcula a partir de slaStartedAt.
      const dueAt = isMoreUrgent(to, fromPriority)
        ? new Date(Math.min(state.dueAt.getTime(), computeDueAt(to, at).getTime()))
        : computeDueAt(to, state.slaStartedAt);
      return { next: { ...base, priority: to, dueAt }, eventDueAt: dueAt, fromStatus: null, fromPriority };
    }

    case "REOPENED": {
      if (event.actorType !== "EMPLOYEE") {
        throw new InvalidTicketTransitionError("Só o funcionário dono do chamado pode reabri-lo");
      }
      if (!canReopen(state, now)) {
        throw new InvalidTicketTransitionError("Chamado só pode ser reaberto até 7 dias depois de resolvido");
      }
      const window = renewed(state, at);
      return {
        next: { ...base, status: "WAITING_ANALYST", resolvedAt: null, ...window },
        eventDueAt: window.dueAt,
        fromStatus: state.status,
        fromPriority: null,
      };
    }

    case "TRANSFERRED":
      if (!isOpen(state)) throw new InvalidTicketTransitionError("Chamado resolvido não pode ser transferido");
      return unchanged();

    default: {
      const exhaustive: never = event.type;
      throw new InvalidTicketTransitionError(`Evento desconhecido: ${String(exhaustive)}`);
    }
  }
}
