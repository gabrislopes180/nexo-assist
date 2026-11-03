import { Prisma, type HandoffReason } from "../generated/prisma/client.js";
import { ConversationNotWithAgentError } from "./conversation-rules.js";
import { timelineMessageSelect, toTimelineMessage, type TimelineMessage } from "./timeline.js";

/** Sem horário no texto: o frontend formata a partir de `createdAt`. */
export const HANDOFF_SYSTEM_MESSAGE = "Transferida para um analista";

/**
 * Passa a conversa para a fila dos analistas, dentro da transação de quem chama.
 * Condicional a `WITH_AGENT`: se o estado mudou, lança e a transação inteira é desfeita.
 * Descarta o rascunho pendente, porque a conversa deixa de estar com o agent.
 * A mensagem SYSTEM fica 1 ms depois de `at`, para vir após a resposta do agent na ordenação.
 * Devolve essa mensagem, para quem chama publicá-la depois do commit.
 */
export async function transferToAnalyst(
  tx: Prisma.TransactionClient,
  { conversationId, reason, summary, at }: { conversationId: string; reason: HandoffReason; summary: string; at: Date },
): Promise<TimelineMessage> {
  const systemAt = new Date(at.getTime() + 1);
  const { count } = await tx.conversation.updateMany({
    where: { id: conversationId, status: "WITH_AGENT" },
    data: {
      status: "WAITING_ANALYST",
      handoffReason: reason,
      handoffSummary: summary,
      handoffAt: systemAt,
      pendingDraft: Prisma.DbNull,
      pendingDraftId: null,
      lastMessageAt: systemAt,
    },
  });
  if (count === 0) throw new ConversationNotWithAgentError();
  const message = await tx.message.create({
    data: { conversationId, authorType: "SYSTEM", authorId: null, content: HANDOFF_SYSTEM_MESSAGE, createdAt: systemAt },
    select: timelineMessageSelect,
  });
  return toTimelineMessage(message);
}
