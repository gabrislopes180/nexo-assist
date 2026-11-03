---
name: project-realtime-sse-frontend
description: Decisoes do plano frontend para console real + SSE (2026-11-03): onde vive o stream, dedupe, fallback, merge do chat do funcionario
metadata:
  type: project
---

Plano de 2026-11-03 (console do analista na API real + SSE nos dois papeis). Decisoes propostas:

- Nucleo SSE generico e puro em `shared/api` (sem React, EventSource injetavel para teste em node), hook fino em `shared/lib/hooks`; adaptadores por papel: console em `pages/analyst-console` (escreve no cache do TanStack Query), funcionario em `features/send-message` (despacha no reducer).
- Fallback: o proprio hook de tempo real faz polling por invalidacao (10 s) quando o stream esta "down"; os `refetchInterval: 15_000` das queries do console saem.
- Chat do funcionario continua no useReducer (nao migrado para Query): ids dos itens passam a ser os do backend (employeeMessage.id, message.id); eventos SSE ficam numa fila enquanto ha turno/acao de rascunho em andamento e sao drenados com dedupe por id.
- Mensagem SYSTEM de transferencia deixa de ser sintetizada localmente; vem do SSE/resync.

**Why:** reducer guarda estado rico (rascunho, seletor, respostas rapidas) que a timeline do backend nao tem; migrar para Query seria refactor grande. SSE pode chegar antes da resposta do POST (publica apos commit).

**How to apply:** rejeitado: provider global unico de realtime para os dois papeis; migrar o chat do funcionario para Query nesta fase. Ver tambem [[feedback-subagent-no-dialogue]] se existir.
