import type { RequestContext } from "@mastra/core/request-context";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { proposedReopenDraftSchema, ticketLookupCriteriaSchema, type SimilarTicket } from "../../shared/chat.js";
import { TicketServiceUnavailableError, type ResolvedTicketReader, type SimilarTicketReader } from "../../tickets/ticket-service.js";
import type { DraftExecution, ReopenBlock, TurnContextValues } from "./turn-recorder.js";

export const DRAFT_REOPEN_TOOL = "draftReopen";

/** Sem campo de usuário: o dono vem da sessão. Sem motivo, a tool pede o que voltou a falhar. */
export const draftReopenInputSchema = z.strictObject({
  code: ticketLookupCriteriaSchema.shape.code,
  keywords: ticketLookupCriteriaSchema.shape.keywords,
  reason: proposedReopenDraftSchema.shape.reason.optional(),
});

export type DraftReopenInput = z.infer<typeof draftReopenInputSchema>;

/** O que o modelo vê: só código e título, e nada que diga se um chamado não encontrado é de outra pessoa. */
const draftReopenOutputSchema = z.discriminatedUnion("outcome", [
  z.strictObject({ outcome: z.literal("DRAFTED"), code: z.string() }),
  z.strictObject({ outcome: z.literal("STILL_OPEN"), code: z.string() }),
  z.strictObject({ outcome: z.literal("WINDOW_EXPIRED"), code: z.string() }),
  z.strictObject({ outcome: z.literal("MULTIPLE"), tickets: z.array(z.strictObject({ code: z.string(), title: z.string() })) }),
  z.strictObject({ outcome: z.literal("NEEDS_REASON"), code: z.string() }),
  z.strictObject({ outcome: z.literal("NOT_FOUND") }),
  z.strictObject({ outcome: z.literal("UNAVAILABLE") }),
]);

export type DraftReopenOutput = z.infer<typeof draftReopenOutputSchema>;

type ToolDeps = { ticketService: ResolvedTicketReader & SimilarTicketReader; now?: () => Date };
type Context = RequestContext<TurnContextValues> | undefined;
type Located = { ticket: SimilarTicket } | ReopenBlock;

async function locate({ ticketService, now = () => new Date() }: ToolDeps, ownerId: string, { code, keywords }: DraftReopenInput): Promise<Located> {
  if (code !== undefined) {
    const found = await ticketService.findResolvedTicketByCode(ownerId, code, now());
    if (!found) return { kind: "NOT_FOUND" };
    if (found.ticket.status !== "RESOLVED") return { kind: "STILL_OPEN", ticket: found.ticket };
    return found.canReopen ? { ticket: found.ticket } : { kind: "WINDOW_EXPIRED", ticket: found.ticket };
  }
  if (keywords === undefined) return { kind: "NOT_FOUND" };
  // Filtrado no serviço antes do corte em 5: abertos parecidos não escondem o reabrível.
  const reopenable = await ticketService.findSimilarTickets(ownerId, keywords, now(), { only: "reopenable" });
  const [only, ...others] = reopenable;
  if (!only) {
    // Só sem reabrível: o problema "voltou" num chamado ainda aberto pede complemento, não chamado novo.
    const open = (await ticketService.findSimilarTickets(ownerId, keywords, now())).find((ticket) => ticket.status !== "RESOLVED");
    return open ? { kind: "STILL_OPEN", ticket: open } : { kind: "NOT_FOUND" };
  }
  return others.length > 0 ? { kind: "MULTIPLE", tickets: reopenable } : { ticket: only };
}

async function evaluate(deps: ToolDeps, ownerId: string, input: DraftReopenInput): Promise<DraftExecution> {
  let located: Located;
  try {
    located = await locate(deps, ownerId, input);
  } catch (error) {
    if (error instanceof TicketServiceUnavailableError) return { outcome: "REOPEN_BLOCKED", block: { kind: "UNAVAILABLE" } };
    throw error;
  }
  if ("kind" in located) return { outcome: "REOPEN_BLOCKED", block: located };
  if (input.reason === undefined) return { outcome: "REOPEN_BLOCKED", block: { kind: "NEEDS_REASON", ticket: located.ticket } };
  const parsed = proposedReopenDraftSchema.safeParse({ kind: "REOPEN", ticket: located.ticket, reason: input.reason });
  // Proposta inválida que chegasse ao ChatService viraria 503 e desfaria o turno.
  return parsed.success ? { outcome: "DRAFTED", proposal: parsed.data } : { outcome: "REOPEN_BLOCKED", block: { kind: "UNAVAILABLE" } };
}

function toModelOutput(execution: DraftExecution): DraftReopenOutput {
  if (execution.outcome === "DRAFTED" && execution.proposal.kind === "REOPEN") return { outcome: "DRAFTED", code: execution.proposal.ticket.code };
  if (execution.outcome !== "REOPEN_BLOCKED") return { outcome: "UNAVAILABLE" };
  const { block } = execution;
  switch (block.kind) {
    case "STILL_OPEN":
    case "WINDOW_EXPIRED":
    case "NEEDS_REASON":
      return { outcome: block.kind, code: block.ticket.code };
    case "MULTIPLE":
      return { outcome: "MULTIPLE", tickets: block.tickets.map(({ code, title }) => ({ code, title })) };
    default:
      return { outcome: block.kind };
  }
}

/** Não grava nada: só registra a proposta no turno. A reabertura exige a confirmação pela rota própria. */
export async function draftReopen(deps: ToolDeps, input: DraftReopenInput, context: Context): Promise<DraftReopenOutput> {
  const ownerId = context?.get("actorId");
  const execution: DraftExecution = ownerId ? await evaluate(deps, ownerId, input) : { outcome: "REOPEN_BLOCKED", block: { kind: "UNAVAILABLE" } };
  context?.get("recorder")?.recordDraft(execution);
  return toModelOutput(execution);
}

export function createDraftReopenTool(deps: ToolDeps) {
  return createTool({
    id: DRAFT_REOPEN_TOOL,
    description:
      "Prepara o rascunho de reabertura de um chamado RESOLVIDO do usuário autenticado, quando o problema voltou. Não reabre nada: ele confere e confirma na tela. " +
      "Use `code` se ele citou o código; senão `keywords` com 1 a 4 palavras do problema (ex.: sap, senha). " +
      "`reason` é o que voltou a falhar, só com o que ele disse; omita se ele não disse.",
    inputSchema: draftReopenInputSchema,
    outputSchema: draftReopenOutputSchema,
    execute: (input, context) => draftReopen(deps, input, context.requestContext as Context),
  });
}
