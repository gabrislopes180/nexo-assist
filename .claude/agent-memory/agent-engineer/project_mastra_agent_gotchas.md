---
name: mastra-agent-gotchas
description: Pegadinhas do @mastra/core 1.81 neste projeto - logger cru, doGenerate no mock, saída estruturada com tools no Gemini, escolha do modelo.
metadata:
  type: project
---

Fatos verificados em 2026-11-01 com `@mastra/core` 1.81.0:

- `AgentConfig` não aceita `logger`, e o logger padrão imprime o corpo cru do erro do provedor. Use `agent.__setLogger(noopLogger)`.
- `agent.generate` chama `doGenerate` do modelo, não `doStream`. Um mock só com `doStream` fica em retry até o timeout.
- `jsonPromptInjection: "system"` com `instructions` compactas entrega o objeto junto com tools, e cobre o turno sem tool com 1 requisição. `prepareStep` também funcionou, mas não cobre esse turno. Os dois foram testados em `gemini-3.6-flash`.
- Retries respeitam o abort (`throwIfAborted` e `waitDelay` com sinal, em `agent-*.js`). O runner mantém um `Promise.race` para o caso de o modelo ignorar o sinal.
- `AbortSignal.timeout` usa timer sem ref; com promessa pendente, o `node:test` encerra o loop. Use `setTimeout` com `AbortController`.

- Instrução não basta para fora de escopo após listar chamados: com histórico de chamados, o `gemini-3.5-flash-lite` ainda chama a tool em parte das vezes, mesmo com `temperature: 0` e a regra "decida só pela mensagem atual". Sem histórico, não chama. A garantia é a guarda em `composeReply`.

- Texto com proposta real vem de template em código, e sem proposta a guarda `claimsFalseAction` barra "adicionei" e "confirma?". O `ChatService` ainda pode descartar a proposta depois do texto pronto.

- Erro transitório do provedor custa cerca de 11 s por causa do retry e vira 503 (`AI_APICallError`, sem status no log seguro). Provável causa dos turnos de 9 a 12 s; não provado.
- `findSimilarTickets` casa com uma keyword só, então uma palavra genérica gera falso duplicado (mouse caiu em chamado de Outlook).

- Para contar retries, `model-calls.ts` envolve o modelo num Proxy (`ModelRouterLanguageModel` + `AsyncLocalStorage`), porque `onRequestRetry` é interno do Mastra. Erro que não é `APICallError` também é retentado (`maxRetries: 1` dá 2 chamadas). Falta validar o Proxy com a LLM real.

Modelo padrão trocado para `google/gemini-3.5-flash-lite`: passo com tool de 0,7 a 1,8 s, turno de 1 a 4 s.

**Why:** `gemini-3.8-flash` tinha mais de 40 s em amostra antiga e não pôde ser medido de novo por falta de cota; a comparação é entre sessões.

**How to apply:** ao revisar o modelo, meça 3.8 no mesmo dia dos candidatos. Veja [[gemini-free-tier-quota]].
