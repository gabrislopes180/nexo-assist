import type { RequestContext } from "@mastra/core/request-context";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { acceptsOffer, asksForPerson, declinesPerson } from "./handoff-intent.js";
import { handoffProposalSchema } from "../../shared/chat.js";
import type { HandoffExecution, TurnContextValues } from "./turn-recorder.js";

export const TRANSFER_TO_ANALYST_TOOL = "transferToAnalyst";

/** Sem campo de usuário nem de analista: quem atende é decidido pelo console. `CRITICAL` não vem do agent. */
export const transferToAnalystInputSchema = handoffProposalSchema;

export type TransferToAnalystInput = z.infer<typeof transferToAnalystInputSchema>;

const transferToAnalystOutputSchema = z.discriminatedUnion("outcome", [
  z.strictObject({ outcome: z.literal("ACCEPTED") }),
  z.strictObject({ outcome: z.literal("REJECTED"), problem: z.enum(["OVERDUE_NOT_ACCEPTED", "OFFER_DECLINED", "DECLINED", "NOT_REQUESTED", "RETURNED_BY_ANALYST", "UNKNOWN_TICKET_CODE", "UNAVAILABLE"]) }),
]);

export type TransferToAnalystOutput = z.infer<typeof transferToAnalystOutputSchema>;

type Context = RequestContext<TurnContextValues> | undefined;

/** Pega também "INC 99999", "inc99999" e travessão no lugar do hífen, e normaliza para "INC-99999". */
const LOOSE_TICKET_CODE = /(?<![\p{L}\d])(INC|REQ)[^\p{L}\d]{0,3}(\d+)(?!\d)/giu;

function summaryCodes(summary: string): string[] {
  return [...summary.matchAll(LOOSE_TICKET_CODE)].map(([, prefix = "", digits = ""]) => `${prefix.toUpperCase()}-${digits}`);
}

/** Códigos que o resumo pode citar: devolvidos por tools no turno ou já mostrados pelo agent na conversa. */
function knownCodes(context: Context): Set<string> {
  const recorder = context?.get("recorder");
  const fromLookups = recorder?.all().flatMap((lookup) => lookup.tickets.map((ticket) => ticket.code)) ?? [];
  const fromDrafts =
    recorder?.drafts().flatMap((execution) =>
      execution.outcome === "DRAFTED" && execution.proposal.kind !== "CREATE" ? [execution.proposal.ticket.code] : [],
    ) ?? [];
  const offered = context?.get("overdueOfferCode");
  return new Set([...(context?.get("knownCodes") ?? []), ...(offered ? [offered] : []), ...fromLookups, ...fromDrafts].map((code) => code.toUpperCase()));
}

type Rejection = Extract<HandoffExecution, { outcome: "REJECTED" }>;

/** Qual motivo vale, ou por que não há transferência. Pedido, recusa e aceite vêm da mensagem, não do modelo. */
function resolvedReason(requested: TransferToAnalystInput["reason"], context: NonNullable<Context>): TransferToAnalystInput["reason"] | Rejection {
  const message = context.get("message") ?? "";
  const offered = context.get("overdueOfferCode");
  const asked = asksForPerson(message);
  if (declinesPerson(message)) return { outcome: "REJECTED", problem: offered ? "OFFER_DECLINED" : "DECLINED" };
  // Resposta à oferta de prazo vencido: só um aceite claro transfere, e sempre como OVERDUE,
  // mesmo escrito como pedido ("Falar com um analista" é a resposta rápida da própria oferta).
  if (offered) return acceptsOffer(message) ? "OVERDUE" : { outcome: "REJECTED", problem: "OVERDUE_NOT_ACCEPTED" };
  // Pedido explícito sempre transfere e fica registrado como EMPLOYEE_REQUEST, qualquer que seja o motivo do modelo.
  // Também vale depois de recusar a oferta: só um novo pedido explícito transfere.
  if (asked) return "EMPLOYEE_REQUEST";
  if (context.get("offerDeclinedRecently")) return { outcome: "REJECTED", problem: "OFFER_DECLINED" };
  if (requested === "OVERDUE") return { outcome: "REJECTED", problem: "OVERDUE_NOT_ACCEPTED" };
  if (requested === "EMPLOYEE_REQUEST") return { outcome: "REJECTED", problem: "NOT_REQUESTED" };
  return requested;
}

/** Conversa devolvida por um analista: o agent não transfere por iniciativa própria pelo resto dela. */
function reasonFor(requested: TransferToAnalystInput["reason"], context: NonNullable<Context>): TransferToAnalystInput["reason"] | Rejection {
  const reason = resolvedReason(requested, context);
  if (!context.get("returnedFromAnalyst") || typeof reason !== "string" || reason === "EMPLOYEE_REQUEST") return reason;
  // Só sobra OVERDUE de uma oferta de antes da devolução (aqui a oferta é suprimida): com pedido explícito vira EMPLOYEE_REQUEST.
  return asksForPerson(context.get("message") ?? "") ? "EMPLOYEE_REQUEST" : { outcome: "REJECTED", problem: "RETURNED_BY_ANALYST" };
}

function evaluate(input: TransferToAnalystInput, context: Context): HandoffExecution {
  if (!context?.get("actorId")) return { outcome: "REJECTED", problem: "UNAVAILABLE" };
  const reason = reasonFor(input.reason, context);
  if (typeof reason !== "string") return reason;
  const known = knownCodes(context);
  if (summaryCodes(input.summary).some((code) => !known.has(code))) {
    return { outcome: "REJECTED", problem: "UNKNOWN_TICKET_CODE" };
  }
  const parsed = handoffProposalSchema.safeParse({ ...input, reason });
  return parsed.success ? { outcome: "ACCEPTED", proposal: parsed.data } : { outcome: "REJECTED", problem: "UNAVAILABLE" };
}

/** Não transfere nada: só registra a proposta no turno. O backend move a conversa ao gravar a resposta. */
export async function transferToAnalyst(input: TransferToAnalystInput, context: Context): Promise<TransferToAnalystOutput> {
  const execution = evaluate(input, context);
  context?.get("recorder")?.recordHandoff(execution);
  return execution.outcome === "ACCEPTED" ? { outcome: "ACCEPTED" } : { outcome: "REJECTED", problem: execution.problem };
}

export function createTransferToAnalystTool() {
  return createTool({
    id: TRANSFER_TO_ANALYST_TOOL,
    description:
      "Transfere a conversa do usuário autenticado para um analista humano. " +
      "`reason`: EMPLOYEE_REQUEST se ele pediu para falar com analista; OVERDUE só se ele aceitou a sua oferta de chamar um analista por chamado vencido; " +
      "LOW_CONFIDENCE se você não tem segurança para resolver. Em conversa devolvida por um analista, só EMPLOYEE_REQUEST é aceito. " +
      "`summary`: para o analista, o que ele pediu, os chamados envolvidos (só códigos devolvidos pelas ferramentas) e o que já foi tentado, sem inventar fatos.",
    inputSchema: transferToAnalystInputSchema,
    outputSchema: transferToAnalystOutputSchema,
    execute: async (input, context) => transferToAnalyst(input, context.requestContext as Context),
  });
}
