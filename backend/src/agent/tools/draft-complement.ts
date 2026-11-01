import type { RequestContext } from "@mastra/core/request-context";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { proposedTicketDraftSchema, ticketLookupCriteriaSchema } from "../../shared/chat.js";
import { TicketServiceUnavailableError, type TicketCodeReader } from "../../tickets/ticket-service.js";
import type { DraftExecution, TurnContextValues } from "./turn-recorder.js";

export const DRAFT_COMPLEMENT_TOOL = "draftComplement";

/** Sem campo de usuário: o dono vem da sessão. */
export const draftComplementInputSchema = z.strictObject({
  code: ticketLookupCriteriaSchema.shape.code.unwrap(),
  content: proposedTicketDraftSchema.shape.content,
});

export type DraftComplementInput = z.infer<typeof draftComplementInputSchema>;

/** O que o modelo vê. Não diz por que o chamado não serve, para não revelar se é alheio ou resolvido. */
const draftComplementOutputSchema = z.discriminatedUnion("outcome", [
  z.strictObject({ outcome: z.literal("DRAFTED"), code: z.string() }),
  z.strictObject({ outcome: z.literal("TICKET_NOT_AVAILABLE") }),
  z.strictObject({ outcome: z.literal("SERVICE_UNAVAILABLE") }),
]);

export type DraftComplementOutput = z.infer<typeof draftComplementOutputSchema>;

type ToolDeps = { ticketService: TicketCodeReader; now?: () => Date };

async function propose({ ticketService, now = () => new Date() }: ToolDeps, ownerId: string, { code, content }: DraftComplementInput): Promise<DraftExecution> {
  try {
    const ticket = await ticketService.findOpenTicketByCode(ownerId, code, now());
    if (!ticket) return { outcome: "TICKET_NOT_AVAILABLE" };
    return { outcome: "DRAFTED", proposal: { kind: "COMPLEMENT", ticket, content } };
  } catch (error) {
    if (error instanceof TicketServiceUnavailableError) return { outcome: "SERVICE_UNAVAILABLE" };
    throw error;
  }
}

/** Não grava nada: só registra a proposta no turno. A gravação exige a confirmação pela rota própria. */
export async function draftComplement(
  deps: ToolDeps,
  input: DraftComplementInput,
  context: RequestContext<TurnContextValues> | undefined,
): Promise<DraftComplementOutput> {
  const ownerId = context?.get("actorId");
  const execution: DraftExecution = ownerId ? await propose(deps, ownerId, input) : { outcome: "SERVICE_UNAVAILABLE" };
  context?.get("recorder")?.recordDraft(execution);
  return execution.outcome === "DRAFTED" ? { outcome: "DRAFTED", code: execution.proposal.ticket.code } : execution;
}

export function createDraftComplementTool(deps: ToolDeps) {
  return createTool({
    id: DRAFT_COMPLEMENT_TOOL,
    description:
      "Prepara um rascunho de complemento para um chamado aberto do usuário autenticado. Não grava nada: o usuário confere e confirma na tela. " +
      "`code` é o código do chamado (ex.: INC-20311). " +
      "`content` é a informação que o usuário quer acrescentar, só com o que ele disse, sem inventar fatos.",
    inputSchema: draftComplementInputSchema,
    outputSchema: draftComplementOutputSchema,
    execute: (input, context) => draftComplement(deps, input, context.requestContext as RequestContext<TurnContextValues> | undefined),
  });
}
