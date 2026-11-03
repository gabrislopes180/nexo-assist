---
name: project-console-attendance-sse
description: Decisoes de backend (2026-11-03) para a API do console do analista (assumir/responder/devolver/encerrar), mensagens do funcionario com analista e o stream SSE
metadata:
  type: project
---

Planejado em 2026-11-03 (dois planos: console + SSE), sem consulta ao usuario; o chamador pediu para decidir o ambiguo.

- Rotas `/console/conversations` seguem o contrato proposto pelo frontend (GET lista, `/:id`, `/:id/messages`, `/:id/tickets`; POST `takeover`, `return`) + POST `/:id/messages` (responder) e `/:id/close`. 409 `CONVERSATION_NOT_WAITING` (assumir/devolver) e 409 `CONVERSATION_NOT_ASSIGNED` (responder/encerrar).
- Schema: `Conversation.assignedAt` e `returnedToAgentAt` (migration `console_attendance`). Devolver limpa analista e campos de handoff; encerrar mantem `analystId`.
- Encerrar exige WITH_ANALYST do proprio analista; devolver aceita WAITING_ANALYST ou WITH_ANALYST proprio; assumir e encerrar sao idempotentes para o mesmo analista.
- Mensagem do funcionario com analista: grava sem LLM, conta em `messageCount` (invariante do seed), mas o limite de 30 so bloqueia turnos com o agent.
- Envelope de POST /chat ganha `employeeMessage` e `message` vira nullable.
- Apos devolver: politica "so pedido explicito" (sem oferta de vencido, sem LOW_CONFIDENCE) pelo resto da conversa, via `returnedToAgentAt`.
- SSE: um stream por papel (`/chat/events` todas as conversas do dono; `/console/events` tudo), barramento em memoria com ring buffer, ids `<bootId>.<seq>`, evento `sync` REPLAY/RESYNC, heartbeat 20 s (proxy do Next 130 s), publicacao so apos commit pelo ConversationService.
- Rejeitado: stream por conversa para o analista (limite de 6 conexoes HTTP/1.1), replay por cursor de `createdAt` no banco (createdAt vem do relogio da app antes do commit, pode furar), WebSocket.

**Why:** alinhar ao contrato ja mockado no frontend e manter "o codigo garante" (transicoes condicionais, autorizacao no servico).
**How to apply:** ao planejar a tela 05, acoes no chamado ou multiplas instancias, partir daqui; multiplas instancias exigem trocar o barramento (Redis pub/sub ou outbox). Ver [[project-analyst-console-decisions]] (memoria do frontend-architecture).
