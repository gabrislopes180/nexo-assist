---
name: browser-test-harness
description: Como testar o chat no navegador sem MCP, sem tocar no backend e sem gastar cota de LLM
metadata:
  type: reference
---

Não há Playwright no projeto. Instale `playwright-core` no scratchpad e use `channel: "chrome"` (o Chrome está instalado).

Para atraso, 503, API fora e respostas gravadas, use um proxy local em :8001 que repassa para :8000 e gere a build com `API_PROXY_TARGET=http://localhost:8001`. O rewrite fica gravado na build, então refaça a build com `:8000` ao terminar.

**Why:** o backend e o `.env` não podem ser alterados, e a cota de LLM é limitada. O proxy exercita o `proxyTimeout` real.

**How to apply:** `getByLabel("Senha")` precisa de `{ exact: true }`. Com `staleTime` de 30 s, teste de troca de sessão entre abas precisa esperar 31 s antes de disparar `visibilitychange`. Ver [[testing-notes]].
