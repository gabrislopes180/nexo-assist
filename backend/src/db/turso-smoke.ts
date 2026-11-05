import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createChatService } from "../chat/chat-service.js";
import type { AgentTurnResult } from "../chat/agent-runner.js";
import { createConversationService } from "../conversations/conversation-service.js";
import { createConversationQueries } from "../conversations/conversation-queries.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import type { ProposedTicketDraft } from "../shared/chat.js";
import { createTicketService } from "../tickets/ticket-service.js";
import { createTicketStatusService } from "../tickets/ticket-status-service.js";

/** Mesmo exercício no SQLite de testes e no Turso explícito; nenhuma chamada à LLM. Sem limpeza ampla. */
export async function runDatabaseSmoke(client: PrismaClient, report: (value: unknown) => void = () => {}) {
  const now = new Date();
  const analysts = await client.user.findMany({ where: { role: "ANALYST" }, take: 2, orderBy: { id: "asc" } });
  assert.equal(analysts.length, 2);
  assert.ok(await client.article.count());
  const owner = await client.user.create({ data: { name: "Validação de integração", email: `smoke-${randomUUID()}@nexo.example`, role: "EMPLOYEE" } });
  report({ stage: "owner-created", ownerId: owner.id });
  const conversations = createConversationService(client);
  const tickets = createTicketService(client);
  const queries = createConversationQueries(client);
  const proposal: Extract<ProposedTicketDraft, { kind: "CREATE" }> = {
    kind: "CREATE", type: "INC", category: "SOFTWARE", priority: "LOW", priorityReason: "Validação individual controlada",
    title: "Validação de integração Turso", description: "Registro fictício de smoke test, sem incidente real.", affectedScope: "INDIVIDUAL",
  };
  const trace = { understood: "Validação controlada da persistência", intent: "OPEN_TICKET" as const, confidence: "HIGH" as const, actions: [], reason: "Runner controlado, sem LLM" };
  let response: AgentTurnResult = { content: "Confira o rascunho de validação.", trace, ticketLookup: null, ticketDraft: proposal };
  const chat = createChatService({ conversations, queries, tickets, agentRunner: { runTurn: async () => response } });
  const draft = await chat.sendMessage(owner, { message: "Preparar registro fictício de validação" });
  assert.ok(draft.ticketDraft);
  const conversationId = draft.conversation.id;
  report({ stage: "draft-created", conversationId, draftId: draft.ticketDraft.id });
  const saved = await chat.getConversation(owner, conversationId);
  assert.equal(saved.pendingDraft?.draft.id, draft.ticketDraft.id);
  assert.equal(saved.messages.length, 2);
  assert.ok(draft.message?.trace);
  assert.equal(await client.ticket.count({ where: { ownerId: owner.id } }), 0);

  // Executa a confirmação real e força a falha antes do commit (ticket, evento, contador e mensagem).
  const controlledFailure = new Error("rollback controlado");
  const rollbackClient = new Proxy(client, {
    get(target, property, receiver) {
      if (property === "$transaction") return async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        target.$transaction(async (tx) => { await operation(tx); throw controlledFailure; }, { timeout: 30_000 });
      return Reflect.get(target, property, receiver);
    },
  });
  const request = { kind: "CREATE" as const, title: proposal.title, description: proposal.description, affectedScope: proposal.affectedScope };
  const counterBefore = await client.ticketCounter.findUniqueOrThrow({ where: { type: "INC" } });
  await assert.rejects(createConversationService(rollbackClient).confirmDraft(owner.id, draft.ticketDraft.id, request, now), (error) => error === controlledFailure);
  assert.equal(await client.ticket.count({ where: { ownerId: owner.id } }), 0);
  assert.equal((await client.ticketCounter.findUniqueOrThrow({ where: { type: "INC" } })).lastNumber, counterBefore.lastNumber);
  assert.equal((await chat.getConversation(owner, conversationId)).pendingDraft?.draft.id, draft.ticketDraft.id);
  assert.equal((await chat.getConversation(owner, conversationId)).messages.length, 2);
  const confirmed = await chat.confirmDraft(owner, draft.ticketDraft.id, request);
  await assert.rejects(chat.confirmDraft(owner, draft.ticketDraft.id, request));
  assert.equal(await client.ticket.count({ where: { ownerId: owner.id } }), 1);
  assert.ok((await tickets.findSimilarTickets(owner.id, ["validação", "integração"], now)).some((ticket) => ticket.code === confirmed.ticket.code));
  report({ stage: "confirmation-and-rollback-verified", ticketCode: confirmed.ticket.code });

  const status = createTicketStatusService(client);
  const analyst = analysts[0]!;
  await status.changeStatus({ code: confirmed.ticket.code, actor: analyst, expectedStatus: "WAITING_ANALYST", toStatus: "IN_PROGRESS", note: null, conversationId, now: new Date() });
  await status.changeStatus({ code: confirmed.ticket.code, actor: analyst, expectedStatus: "IN_PROGRESS", toStatus: "RESOLVED", note: "Resolução fictícia para validar reabertura.", conversationId, now: new Date() });
  const resolved = await tickets.findResolvedTicketByCode(owner.id, confirmed.ticket.code, new Date());
  assert.ok(resolved?.canReopen);
  response = { content: "Confira a reabertura.", trace: { ...trace, intent: "REOPEN" }, ticketLookup: null, ticketDraft: { kind: "REOPEN", ticket: resolved.ticket, reason: "Validação fictícia de reabertura" } };
  const reopening = await chat.sendMessage(owner, { message: "Reabrir validação", conversationId });
  assert.ok(reopening.ticketDraft);
  await chat.confirmDraft(owner, reopening.ticketDraft.id, { kind: "REOPEN", reason: "Validação fictícia de reabertura" });
  const reopened = await client.ticket.findUniqueOrThrow({ where: { code: confirmed.ticket.code } });
  assert.equal(reopened.status, "WAITING_ANALYST");
  assert.ok(reopened.dueAt instanceof Date);
  assert.equal(reopened.resolvedAt, null);
  const lastEvent = await client.ticketEvent.findFirstOrThrow({ where: { ticketId: reopened.id }, orderBy: { createdAt: "desc" } });
  assert.equal(lastEvent.type, "REOPENED");
  assert.equal(lastEvent.dueAt?.toISOString(), reopened.dueAt.toISOString());
  let updateBlocked = false;
  await assert.rejects(client.$transaction(async (tx) => {
    try { await tx.ticketEvent.update({ where: { id: lastEvent.id }, data: { content: "não deve persistir" } }); }
    catch { updateBlocked = true; }
    throw controlledFailure;
  }), (error) => error === controlledFailure);
  assert.ok(updateBlocked, "trigger append-only deve bloquear UPDATE");
  let deleteBlocked = false;
  await assert.rejects(client.$transaction(async (tx) => {
    try { await tx.user.delete({ where: { id: owner.id } }); } catch { deleteBlocked = true; }
    throw controlledFailure;
  }), (error) => error === controlledFailure);
  assert.ok(deleteBlocked, "chave estrangeira deve impedir apagar o dono");

  response = { content: "Transferência de validação.", trace: { ...trace, intent: "TALK_TO_ANALYST" }, ticketLookup: null, handoff: { reason: "EMPLOYEE_REQUEST", summary: "Transferência fictícia para validar persistência." } };
  await chat.sendMessage(owner, { message: "Quero falar com um analista", conversationId });
  assert.equal((await client.conversation.findUniqueOrThrow({ where: { id: conversationId } })).handoffReason, "EMPLOYEE_REQUEST");
  const race = await Promise.allSettled(analysts.map((person) => conversations.takeOver(conversationId, person, new Date())));
  assert.equal(race.filter((result) => result.status === "fulfilled").length, 1);
  const assigned = await client.conversation.findUniqueOrThrow({ where: { id: conversationId } });
  const winner = analysts.find((person) => person.id === assigned.analystId)!;
  await conversations.replyAsAnalyst(conversationId, winner, "Resposta fictícia de validação.", new Date());
  await conversations.returnToAgent(conversationId, winner, new Date());
  const returned = await chat.getConversation(owner, conversationId);
  assert.equal(returned.conversation.status, "WITH_AGENT");
  assert.ok(returned.messages.some((message) => message.authorType === "ANALYST"));
  const result = { ownerId: owner.id, conversationId, ticketCode: reopened.code, messageCount: returned.conversation.messageCount, checks: ["read", "json-and-draft", "confirm-once", "duplicate-lookup", "rollback", "reopen-and-sla", "append-only-trigger", "foreign-keys", "handoff", "takeover-race", "analyst-reply", "return"] };
  report({ stage: "smoke-complete", ...result });
  return result;
}
