import type { StatusTone } from "@/shared/ui/status-badge";
import type {
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from "../model/ticket";

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
