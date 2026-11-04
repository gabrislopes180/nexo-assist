import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import type { PendingDraftView, ProposedTicketDraft } from "../shared/chat.js";
import { confirmableDraftSchema } from "../shared/conversation-draft.js";
import { createTicketService } from "../tickets/ticket-service.js";
import { toDraftView } from "./draft-view.js";
import { snapshotSelect, timelineMessageSelect, toTimelineMessage, type ConversationSnapshot, type TimelineMessage } from "./timeline.js";

export type EmployeeSnapshot = {
  snapshot: ConversationSnapshot;
  messages: TimelineMessage[];
  pendingDraft?: PendingDraftView | null;
};

type Reader = Pick<PrismaClient, "conversation" | "ticket">;
const DRAFT_TOOL = { CREATE: "draftTicket", COMPLEMENT: "draftComplement", REOPEN: "draftReopen" } as const;

/** Só leitura. O chamador usa transação para estado, histórico e proposta virem do mesmo snapshot. */
export async function readEmployeeSnapshot(client: Reader, ownerId: string, conversationId?: string, now = new Date()): Promise<EmployeeSnapshot | null> {
  const where: Prisma.ConversationWhereInput = conversationId === undefined
    ? { ownerId, status: { in: ["WITH_AGENT", "WAITING_ANALYST", "WITH_ANALYST"] } }
    : { id: conversationId, ownerId };
  const row = await client.conversation.findFirst({
    where,
    orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
    select: {
      ...snapshotSelect,
      pendingDraft: true,
      pendingDraftId: true,
      messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: timelineMessageSelect },
    },
  });
  if (!row) return null;
  const { pendingDraft: rawDraft, pendingDraftId, messages: rows, ...snapshot } = row;
  const messages = rows.map(toTimelineMessage);
  const result: EmployeeSnapshot = { snapshot, messages, pendingDraft: null };
  const parsed = confirmableDraftSchema.safeParse(rawDraft);
  if (snapshot.status !== "WITH_AGENT" || !parsed.success || parsed.data.draftId !== pendingDraftId) return result;

  const draft = parsed.data;
  // Dados novos têm associação exata por id; o fallback só atende propostas antigas, anteriores aos anexos.
  const message = [...messages].reverse().find((item) => item.authorType === "AGENT" && (
    item.trace?.attachments?.ticketDraft?.id === draft.draftId ||
    (!item.trace?.attachments && item.trace?.actions.some((action) => action.tool === DRAFT_TOOL[draft.kind] && action.status === "SUCCESS"))
  ));
  if (!message) return result;

  let proposal: ProposedTicketDraft;
  if (draft.kind === "CREATE") {
    const { draftId: _id, createdAt: _at, ...fields } = draft;
    proposal = fields;
  } else {
    // Uma proposta pendente é uma ação futura: relê apenas esse chamado, sempre pelo dono.
    const tickets = createTicketService(client);
    if (draft.kind === "COMPLEMENT") {
      const ticket = await tickets.findOpenTicketByCode(ownerId, draft.ticketCode, now);
      if (!ticket) return result;
      proposal = { kind: "COMPLEMENT", ticket, content: draft.content };
    } else {
      const found = await tickets.findResolvedTicketByCode(ownerId, draft.ticketCode, now);
      if (!found?.canReopen) return result;
      proposal = { kind: "REOPEN", ticket: found.ticket, reason: draft.reason };
    }
  }
  result.pendingDraft = { messageId: message.id, draft: toDraftView(proposal, draft.draftId, now) };
  return result;
}
