import type { SystemKind } from "../model/timeline-message";

/** Ícones do design system: `arrow-right-left`, `headset` e `bot` (devolver ao agent). */
export type SystemEventIcon = "transfer" | "takeover" | "return";

// Encerramento fica sem ícone: o design system não tem um com esse significado.
const ICON_BY_KIND = {
  HANDOFF: "transfer",
  TAKEOVER: "takeover",
  RETURNED: "return",
  CLOSED: null,
} as const satisfies Record<SystemKind, SystemEventIcon | null>;

/** Ícone do marco pelo `systemKind`; o texto é só para exibir. Compartilhado pelo chat e pelo console. */
export function systemEventIcon(
  systemKind: SystemKind | null,
): SystemEventIcon | null {
  return systemKind === null ? null : ICON_BY_KIND[systemKind];
}
