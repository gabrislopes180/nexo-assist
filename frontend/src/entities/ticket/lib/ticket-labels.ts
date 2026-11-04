import type { StatusTone } from "@/shared/ui/status-badge";
import type {
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from "../model/ticket";
import type { ConsoleTicketStatus } from "../model/console-ticket";
import type { AffectedScope } from "../model/ticket-draft";

export const TYPE_LABELS: Record<"INC" | "REQ", string> = {
  INC: "Incidente",
  REQ: "Requisição",
};

export const CATEGORY_LABELS: Record<TicketCategory, string> = {
  ACCESS: "Acesso",
  NETWORK_VPN: "Rede e VPN",
  HARDWARE: "Hardware",
  SOFTWARE: "Software",
  EMAIL: "E-mail",
  OTHER: "Outros",
};

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  CRITICAL: "Crítica",
  HIGH: "Alta",
  MEDIUM: "Média",
  LOW: "Baixa",
};

export const PRIORITY_TONES: Record<TicketPriority, StatusTone> = {
  CRITICAL: "danger",
  HIGH: "warning",
  MEDIUM: "medium",
  LOW: "neutral",
};

export const STATUS_TONES: Record<TicketStatus, StatusTone> = {
  WAITING_ANALYST: "warning",
  WAITING_EMPLOYEE: "warning",
  IN_PROGRESS: "info",
  APPROVED: "success",
};

/** No console aparecem também os resolvidos. */
export const CONSOLE_STATUS_TONES: Record<ConsoleTicketStatus, StatusTone> = {
  ...STATUS_TONES,
  RESOLVED: "neutral",
};

/** Igual a TICKET_STATUS_LABEL do backend (tickets/ticket-rules.ts). */
export const CONSOLE_STATUS_LABELS: Record<ConsoleTicketStatus, string> = {
  WAITING_ANALYST: "Aguardando analista",
  IN_PROGRESS: "Em andamento",
  WAITING_EMPLOYEE: "Aguardando funcionário",
  APPROVED: "Aprovado",
  RESOLVED: "Resolvido",
};

/** Para o analista, em terceira pessoa (o rascunho do funcionário diz "Somente você"). */
export const AFFECTED_SCOPE_CONSOLE_LABELS: Record<AffectedScope, string> = {
  INDIVIDUAL: "Individual",
  TEAM: "Equipe",
  COMPANY: "Toda a empresa",
};
