export type SystemEventIcon = "transfer" | "takeover";

// Depende dos textos SYSTEM do backend; texto desconhecido fica sem ícone.
const TRANSFER_TEXT = "Transferida para um analista";
const TAKEOVER_SUFFIX = "assumiu a conversa";

/** Ícone do marco: transferência ou analista assumindo. Compartilhado pelo chat e pelo console. */
export function systemEventIcon(content: string): SystemEventIcon | null {
  if (content === TRANSFER_TEXT) return "transfer";
  if (content.endsWith(TAKEOVER_SUFFIX)) return "takeover";
  return null;
}
