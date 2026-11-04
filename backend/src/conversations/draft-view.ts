import type { ProposedTicketDraft, TicketDraft } from "../shared/chat.js";
import { computeDueAt } from "../tickets/sla.js";

export function toDraftView(proposal: ProposedTicketDraft, id: string, at: Date): TicketDraft {
  if (proposal.kind === "COMPLEMENT") return { id, ...proposal };
  if (proposal.kind === "REOPEN") return { id, ...proposal, dueAtPreview: computeDueAt(proposal.ticket.priority, at).toISOString() };
  const { priorityReason: _priorityReason, ...visible } = proposal;
  return { id, ...visible, dueAtPreview: computeDueAt(proposal.priority, at).toISOString() };
}
