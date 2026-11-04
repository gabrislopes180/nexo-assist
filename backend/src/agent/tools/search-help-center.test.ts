import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RequestContext } from "@mastra/core/request-context";
import { KnowledgeUnavailableError, type KnowledgeService } from "../../knowledge/knowledge-service.js";
import { helpCenterSearchInputSchema, type HelpArticle, type HelpCenterSearchInput } from "../../shared/knowledge.js";
import { createSearchHelpCenterTool, searchHelpCenter } from "./search-help-center.js";
import { createTurnRecorder, type TurnContextValues, type TurnRecorder } from "./turn-recorder.js";

const VPN: HelpArticle = { slug: "vpn-erro-809", title: "VPN com erro 809", category: "NETWORK_VPN", content: "Reinstale o cliente. Vale apenas para Windows 10." };
const HOURS: HelpArticle = { slug: "horario-service-desk", title: "Horário do service desk", category: "OTHER", content: "De segunda a sexta, das 8h às 18h." };

type Search = Pick<KnowledgeService, "searchArticles">;

function fakeKnowledge(result: () => Promise<HelpArticle[]>) {
  const calls: HelpCenterSearchInput[] = [];
  const service: Search = {
    searchArticles(input) {
      calls.push(input);
      return result();
    },
  };
  return { service, calls };
}

function contextOf(recorder: TurnRecorder): RequestContext<TurnContextValues> {
  const context = new RequestContext<TurnContextValues>();
  context.set("recorder", recorder);
  return context;
}

describe("searchHelpCenter", () => {
  it("FOUND com os artigos do serviço, registrado no turno", async () => {
    const { service, calls } = fakeKnowledge(() => Promise.resolve([VPN, HOURS]));
    const recorder = createTurnRecorder();
    const result = await searchHelpCenter({ knowledgeService: service }, { keywords: ["vpn", "809"] }, contextOf(recorder));
    assert.deepEqual(calls, [{ keywords: ["vpn", "809"] }]);
    assert.deepEqual(result, { outcome: "FOUND", articles: [VPN, HOURS] });
    assert.deepEqual(recorder.articleSearches(), [result]);
  });

  it("lista vazia vira NO_MATCH", async () => {
    const { service } = fakeKnowledge(() => Promise.resolve([]));
    const recorder = createTurnRecorder();
    const result = await searchHelpCenter({ knowledgeService: service }, { keywords: ["teclado"] }, contextOf(recorder));
    assert.deepEqual(result, { outcome: "NO_MATCH", articles: [] });
    assert.deepEqual(recorder.articleSearches(), [result]);
  });

  it("nunca passa de 3 artigos", async () => {
    const { service } = fakeKnowledge(() => Promise.resolve([VPN, HOURS, { ...VPN, slug: "a" }, { ...VPN, slug: "b" }]));
    const result = await searchHelpCenter({ knowledgeService: service }, { keywords: ["vpn"] }, contextOf(createTurnRecorder()));
    assert.equal(result.articles.length, 3);
  });

  it("KnowledgeUnavailableError vira UNAVAILABLE, sem quebrar o turno", async () => {
    const { service } = fakeKnowledge(() => Promise.reject(new KnowledgeUnavailableError()));
    const recorder = createTurnRecorder();
    const result = await searchHelpCenter({ knowledgeService: service }, { keywords: ["vpn"] }, contextOf(recorder));
    assert.deepEqual(result, { outcome: "UNAVAILABLE", articles: [] });
    assert.deepEqual(recorder.articleSearches(), [result]);
  });

  it("sem serviço configurado responde UNAVAILABLE", async () => {
    const recorder = createTurnRecorder();
    const result = await searchHelpCenter({}, { keywords: ["vpn"] }, contextOf(recorder));
    assert.equal(result.outcome, "UNAVAILABLE");
    assert.equal(recorder.articleSearches().length, 1);
  });

  it("erro inesperado não é tratado como indisponibilidade", async () => {
    const { service } = fakeKnowledge(() => Promise.reject(new TypeError("bug")));
    await assert.rejects(searchHelpCenter({ knowledgeService: service }, { keywords: ["vpn"] }, contextOf(createTurnRecorder())), TypeError);
  });

  it("valida a entrada antes de chamar o serviço: entrada inválida é NO_MATCH sem consulta", async () => {
    const { service, calls } = fakeKnowledge(() => Promise.resolve([VPN]));
    const recorder = createTurnRecorder();
    const result = await searchHelpCenter({ knowledgeService: service }, { keywords: [] }, contextOf(recorder));
    assert.equal(calls.length, 0);
    assert.deepEqual(result, { outcome: "NO_MATCH", articles: [] });
    assert.equal(recorder.articleSearches().length, 1);
  });

  it("a tool usa o schema compartilhado e pede keywords curtas", async () => {
    const { service } = fakeKnowledge(() => Promise.resolve([VPN]));
    const tool = createSearchHelpCenterTool({ knowledgeService: service });
    assert.equal(tool.inputSchema, helpCenterSearchInputSchema);
    assert.match(tool.description, /1 ou 2 palavras/);
    const result = await tool.execute?.({ keywords: ["vpn"] }, { requestContext: contextOf(createTurnRecorder()) as RequestContext });
    assert.deepEqual(result, { outcome: "FOUND", articles: [VPN] });
  });
});
