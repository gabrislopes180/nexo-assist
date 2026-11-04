import type { RequestContext } from "@mastra/core/request-context";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { normalizeSearchText } from "../../knowledge/search-text.js";
import { proposedCreateDraftSchema, ticketLookupCriteriaSchema, type SimilarTicket } from "../../shared/chat.js";
import { capPriority } from "../../tickets/ticket-rules.js";
import { TicketServiceUnavailableError, type SimilarTicketReader } from "../../tickets/ticket-service.js";
import type { DraftExecution, TurnContextValues } from "./turn-recorder.js";

export const DRAFT_TICKET_TOOL = "draftTicket";

export const AFFECTED_QUESTION = "Quem está sendo afetado?";
export const AFFECTED_QUICK_REPLIES = ["Só eu", "Minha equipe", "Toda a empresa", "Não sei"];

const create = proposedCreateDraftSchema.shape;

/** Sem campo de usuário e sem prazo: o dono vem da sessão, e o prazo, da regra de SLA ao confirmar. */
export const draftTicketInputSchema = z.strictObject({
  title: create.title,
  description: create.description,
  type: create.type,
  category: create.category,
  priority: create.priority,
  priorityReason: create.priorityReason,
  affectedScope: create.affectedScope.optional(),
  affectedDescription: create.affectedDescription,
  keywords: ticketLookupCriteriaSchema.shape.keywords.unwrap(),
  acknowledgedDuplicates: z.array(z.string()).max(10).optional(),
});

export type DraftTicketInput = z.infer<typeof draftTicketInputSchema>;

const similarForModelSchema = z.strictObject({ code: z.string(), title: z.string(), statusLabel: z.string(), canReopen: z.boolean() });

const draftTicketOutputSchema = z.discriminatedUnion("outcome", [
  z.strictObject({ outcome: z.literal("DRAFTED") }),
  z.strictObject({ outcome: z.literal("NEEDS_AFFECTED_SCOPE") }),
  z.strictObject({ outcome: z.literal("POSSIBLE_DUPLICATE"), similar: z.array(similarForModelSchema) }),
  z.strictObject({ outcome: z.literal("UNAVAILABLE") }),
]);

export type DraftTicketOutput = z.infer<typeof draftTicketOutputSchema>;

type AffectedScope = NonNullable<DraftTicketInput["affectedScope"]>;
/** `cappedReason`: motivo mostrado quando o teto baixa a prioridade, fiel ao que o usuário disse. */
type Scope = { affectedScope: AffectedScope; affectedDescription?: string; cappedReason?: string };

const QUICK_REPLY_SCOPE: Readonly<Record<string, Scope>> = {
  "so eu": { affectedScope: "INDIVIDUAL" },
  "minha equipe": { affectedScope: "TEAM" },
  "toda a empresa": { affectedScope: "COMPANY" },
  "nao sei": {
    affectedScope: "INDIVIDUAL",
    affectedDescription: "O funcionário não soube informar quem está sendo afetado.",
    cappedReason: "não foi possível confirmar que afeta mais pessoas",
  },
};

const CAPPED_PRIORITY_REASON = "afeta só você";

type ToolDeps = { ticketService: SimilarTicketReader; now?: () => Date };
type Context = RequestContext<TurnContextValues> | undefined;

function quickReplyScope(message: string | undefined): Scope | undefined {
  const words = normalizeSearchText(message ?? "").match(/[\p{L}\p{N}]+/gu) ?? [];
  return QUICK_REPLY_SCOPE[words.join(" ")];
}

/** Resposta rápida é a palavra do usuário: vale mais que o escopo escolhido pelo modelo. */
function scopeOf(input: DraftTicketInput, message: string | undefined): Scope | undefined {
  const quick = quickReplyScope(message);
  if (quick) return quick;
  if (!input.affectedScope) return undefined;
  return { affectedScope: input.affectedScope, ...(input.affectedDescription ? { affectedDescription: input.affectedDescription } : {}) };
}

/** O modelo só pode reconhecer o que o usuário já viu: código encontrado agora e citado antes pelo agent. */
function unacknowledged(similar: readonly SimilarTicket[], acknowledged: readonly string[] = [], shownCodes: readonly string[] = []): SimilarTicket[] {
  const shown = new Set(shownCodes.map((code) => code.toUpperCase()));
  const valid = new Set(acknowledged.map((code) => code.toUpperCase()).filter((code) => shown.has(code)));
  return similar.filter((ticket) => !valid.has(ticket.code.toUpperCase()));
}

const MAX_DESCRIPTION = 2000;

const SEPARATOR = "\n\n";

/**
 * Garante em código a relação com o chamado fora da janela e o artigo que o usuário já tentou.
 * Linha que o modelo já escreveu (em qualquer caixa) não se repete; o corpo é cortado uma vez só, para caber todas.
 */
function withContext(description: string, context: Context): string {
  const relatedCode = context?.get("relatedCode");
  const triedArticle = context?.get("triedArticle");
  const markers = [relatedCode ? `Relacionado ao ${relatedCode}` : null, triedArticle ? `Já tentou: ${triedArticle}` : null];
  const lower = description.toLowerCase();
  const lines = markers.flatMap((marker) => (marker && !lower.includes(marker.toLowerCase()) ? [`${marker}.`] : []));
  if (lines.length === 0) return description;
  const tail = lines.map((line) => `${SEPARATOR}${line}`).join("");
  return `${description.slice(0, Math.max(0, MAX_DESCRIPTION - tail.length)).trimEnd()}${tail}`;
}

function toProposal(input: DraftTicketInput, { cappedReason = CAPPED_PRIORITY_REASON, ...scope }: Scope, context: Context): DraftExecution {
  const priority = capPriority(input.priority, scope.affectedScope);
  const parsed = proposedCreateDraftSchema.safeParse({
    kind: "CREATE",
    type: input.type,
    category: input.category,
    priority,
    priorityReason: priority === input.priority ? input.priorityReason : cappedReason,
    title: input.title,
    description: withContext(input.description, context),
    ...scope,
  });
  // Proposta inválida que chegasse ao ChatService viraria 503 e desfaria o turno.
  return parsed.success ? { outcome: "DRAFTED", proposal: parsed.data } : { outcome: "UNAVAILABLE" };
}

async function evaluate({ ticketService, now = () => new Date() }: ToolDeps, ownerId: string, input: DraftTicketInput, context: Context): Promise<DraftExecution> {
  let found: SimilarTicket[];
  try {
    found = await ticketService.findSimilarTickets(ownerId, input.keywords, now());
  } catch (error) {
    if (error instanceof TicketServiceUnavailableError) return { outcome: "UNAVAILABLE" };
    throw error;
  }
  // Parecidos antes de afetados: quem vai complementar não precisa responder a pergunta.
  const similar = unacknowledged(found, input.acknowledgedDuplicates, context?.get("shownCodes"));
  if (similar.length > 0) return { outcome: "POSSIBLE_DUPLICATE", similar };
  const scope = scopeOf(input, context?.get("message"));
  return scope ? toProposal(input, scope, context) : { outcome: "NEEDS_AFFECTED_SCOPE" };
}

/** Não grava nada: só registra a proposta no turno. A criação exige a confirmação pela rota própria. */
export async function draftTicket(deps: ToolDeps, input: DraftTicketInput, context: Context): Promise<DraftTicketOutput> {
  const ownerId = context?.get("actorId");
  const execution: DraftExecution = ownerId ? await evaluate(deps, ownerId, input, context) : { outcome: "UNAVAILABLE" };
  context?.get("recorder")?.recordDraft(execution);
  if (execution.outcome === "POSSIBLE_DUPLICATE") {
    return { outcome: "POSSIBLE_DUPLICATE", similar: execution.similar.map(({ code, title, statusLabel, canReopen }) => ({ code, title, statusLabel, canReopen })) };
  }
  if (execution.outcome === "DRAFTED") return { outcome: "DRAFTED" };
  return execution.outcome === "NEEDS_AFFECTED_SCOPE" ? { outcome: "NEEDS_AFFECTED_SCOPE" } : { outcome: "UNAVAILABLE" };
}

export function createDraftTicketTool(deps: ToolDeps) {
  return createTool({
    id: DRAFT_TICKET_TOOL,
    description:
      "Prepara o rascunho de um chamado NOVO para o usuário autenticado, a partir do relato dele. Não cria nada: ele confere e confirma na tela. " +
      "`title` e `description` só com o que ele disse. `type`: INC se algo parou ou não funciona, REQ se é pedido de acesso, equipamento ou software. " +
      "`priority`: LOW, MEDIUM, HIGH ou CRITICAL, com `priorityReason` curto, começando em minúscula. " +
      "`affectedScope`: só se ele disse quem é afetado (INDIVIDUAL, TEAM ou COMPANY). " +
      "`keywords`: 1 a 4 palavras do sintoma, evitando o nome genérico do equipamento se o sintoma for mais específico (ex.: vpn, 809). " +
      "`acknowledgedDuplicates`: códigos parecidos só depois de ele dizer que quer abrir um novo mesmo assim.",
    inputSchema: draftTicketInputSchema,
    outputSchema: draftTicketOutputSchema,
    execute: (input, context) => draftTicket(deps, input, context.requestContext as Context),
  });
}
