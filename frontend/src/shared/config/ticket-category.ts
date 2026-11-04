/**
 * Categorias de TI do backend (`TicketCategory`): valem para chamados e para os
 * artigos da central de ajuda.
 */
export const TICKET_CATEGORIES = [
  "ACCESS",
  "NETWORK_VPN",
  "HARDWARE",
  "SOFTWARE",
  "EMAIL",
  "OTHER",
] as const;

export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<TicketCategory, string> = {
  ACCESS: "Acesso",
  NETWORK_VPN: "Rede e VPN",
  HARDWARE: "Hardware",
  SOFTWARE: "Software",
  EMAIL: "E-mail",
  OTHER: "Outros",
};
