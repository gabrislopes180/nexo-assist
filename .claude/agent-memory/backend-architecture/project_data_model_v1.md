---
name: project-data-model-v1
description: Decisoes propostas (2026-10-29, pendentes de aprovacao do usuario) para o schema Prisma/SQLite, prazos (SLA) e seed do Nexo Assist, e fatos verificados do toolchain
metadata:
  type: project
---

Plano do modelo de dados + seed entregue em 2026-10-29 (PROPOSTO, aguardando revisao do usuario; confirmar no schema.prisma antes de tratar como decidido).

Decisoes propostas e por que:
- Enums nativos do Prisma no SQLite (verificado no 7.10.1: viram TEXT sem CHECK; Json vira JSONB/TEXT). Zod so na borda.
- Status do chamado: WAITING_ANALYST, IN_PROGRESS, APPROVED (so REQ), RESOLVED. "Vencido" e "reabrivel" sao derivados (dueAt / resolvedAt), nao status.
- Codigo INC/REQ via tabela TicketCounter incrementada na mesma transacao da criacao (rejeitado: max(code)+1, que corre risco de corrida; aleatorio+retry).
- Prazo: modulo puro src/tickets/sla.ts, fuso fixo -03:00 (America/Sao_Paulo sem DST), sem feriados. Comentario do funcionario NAO renova dueAt (renovar mascararia chamado vencido, que e gatilho de transferencia).
- Mastra deve usar arquivo SQLite separado (mastra.db): tabelas estranhas no dev.db causariam drift no prisma migrate dev.

Fatos verificados do toolchain (nao obvios):
- Prisma 7.10.1 detecta automaticamente backend/prisma7.config.ts (nao precisa renomear nem --config).
- TS 7.0.2 compila o client gerado com imports ".ts" e reescreve para ".js" no emit; nao precisa importFileExtension.
- Adapter libsql liga foreign_keys=1.
- migrate reset e bloqueado para agentes de IA sem consentimento explicito do usuario (PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION).
- docs/architecture/fluxo-nexo-assist.drawio (v1) nao existe; so o v2.

**Why:** primeira entrega do backend; decisoes de schema evitam migrations futuras.
**How to apply:** ao planejar servicos (TicketService, ConversationService), reutilizar sla.ts/ticket-rules.ts e o contrato de pendingDraft/trace; checar se o usuario mudou alguma decisao aberta.
