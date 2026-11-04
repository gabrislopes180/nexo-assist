import type { RequestContext } from "@mastra/core/request-context";
import { createTool } from "@mastra/core/tools";
import { KnowledgeUnavailableError, type KnowledgeService } from "../../knowledge/knowledge-service.js";
import { helpCenterSearchInputSchema, helpCenterSearchResultSchema, type HelpCenterSearchResult } from "../../shared/knowledge.js";
import type { TurnContextValues } from "./turn-recorder.js";

export const SEARCH_HELP_CENTER_TOOL = "searchHelpCenter";

const MAX_ARTICLES = 3;
const NO_MATCH: HelpCenterSearchResult = { outcome: "NO_MATCH", articles: [] };
const UNAVAILABLE: HelpCenterSearchResult = { outcome: "UNAVAILABLE", articles: [] };

type ToolDeps = { knowledgeService?: Pick<KnowledgeService, "searchArticles"> };

async function search({ knowledgeService }: ToolDeps, rawInput: unknown): Promise<HelpCenterSearchResult> {
  if (!knowledgeService) return UNAVAILABLE;
  // O serviço não valida: entrada fora do contrato não vira busca.
  const input = helpCenterSearchInputSchema.safeParse(rawInput);
  if (!input.success) return NO_MATCH;
  try {
    const articles = await knowledgeService.searchArticles(input.data);
    const [first, ...rest] = articles.slice(0, MAX_ARTICLES);
    return first ? { outcome: "FOUND", articles: [first, ...rest] } : NO_MATCH;
  } catch (error) {
    if (error instanceof KnowledgeUnavailableError) return UNAVAILABLE;
    throw error;
  }
}

/** Só leitura. O resultado fica no turno: a citação do modelo só vale para slug daqui. */
export async function searchHelpCenter(deps: ToolDeps, rawInput: unknown, context: RequestContext<TurnContextValues> | undefined): Promise<HelpCenterSearchResult> {
  const result = await search(deps, rawInput);
  context?.get("recorder")?.recordArticleSearch(result);
  return result;
}

export function createSearchHelpCenterTool(deps: ToolDeps) {
  return createTool({
    id: SEARCH_HELP_CENTER_TOOL,
    description:
      "Busca artigos da central de ajuda de TI para responder uma dúvida (como fazer algo, horário do suporte, erro conhecido). Só leitura. " +
      "`keywords`: termos curtos, de 1 ou 2 palavras cada, tirados da mensagem (ex.: [\"vpn\", \"809\", \"windows 10\"]); nunca a frase inteira. " +
      "`category` só se for óbvia. FOUND: até 3 artigos com o texto; NO_MATCH: nenhum artigo; UNAVAILABLE: central fora do ar.",
    inputSchema: helpCenterSearchInputSchema,
    outputSchema: helpCenterSearchResultSchema,
    execute: (input, context) => searchHelpCenter(deps, input, context.requestContext as RequestContext<TurnContextValues> | undefined),
  });
}
