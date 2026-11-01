import type { ProposedTicketDraft, TicketLookupResult } from "../../shared/chat.js";

export type DraftExecution =
  | { outcome: "DRAFTED"; proposal: ProposedTicketDraft }
  /** Inexistente, resolvido ou de outro dono: o agent não pode distinguir. */
  | { outcome: "TICKET_NOT_AVAILABLE" }
  | { outcome: "SERVICE_UNAVAILABLE" };

/** Guarda o que as tools executaram de fato: `ticketLookup`, `ticketDraft` e `trace.actions` saem daqui, não do texto da LLM. */
export type TurnRecorder = {
  record(result: TicketLookupResult): void;
  all(): readonly TicketLookupResult[];
  /** Com várias chamadas no turno, vale a última. */
  last(): TicketLookupResult | undefined;
  recordDraft(execution: DraftExecution): void;
  drafts(): readonly DraftExecution[];
};

export function createTurnRecorder(): TurnRecorder {
  const lookups: TicketLookupResult[] = [];
  const drafts: DraftExecution[] = [];
  return {
    record: (result) => {
      lookups.push(result);
    },
    all: () => lookups,
    last: () => lookups.at(-1),
    recordDraft: (execution) => {
      drafts.push(execution);
    },
    drafts: () => drafts,
  };
}

/** Valores por turno. O dono vem daqui e da sessão, nunca da entrada das tools. */
export type TurnContextValues = { actorId: string; actorName: string; recorder: TurnRecorder };
