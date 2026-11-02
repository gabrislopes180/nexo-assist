import type { ProposedTicketDraft, SimilarTicket, TicketLookupResult } from "../../shared/chat.js";

/** Execuções de `draftComplement` e `draftTicket`, na ordem em que aconteceram. */
export type DraftExecution =
  | { outcome: "DRAFTED"; proposal: ProposedTicketDraft }
  /** Inexistente, resolvido ou de outro dono: o agent não pode distinguir. */
  | { outcome: "TICKET_NOT_AVAILABLE" }
  | { outcome: "SERVICE_UNAVAILABLE" }
  | { outcome: "NEEDS_AFFECTED_SCOPE" }
  | { outcome: "POSSIBLE_DUPLICATE"; similar: SimilarTicket[] }
  | { outcome: "UNAVAILABLE" };

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
export type TurnContextValues = {
  actorId: string;
  actorName: string;
  /** Mensagem atual: a resposta rápida de afetados vale mais que o escopo escolhido pelo modelo. */
  message: string;
  /** Códigos já citados pelo agent na conversa: só eles podem ser reconhecidos como parecidos. */
  shownCodes: readonly string[];
  recorder: TurnRecorder;
};
