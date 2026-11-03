---
name: returned-from-analyst-policy
description: Politica do agent depois que um analista devolve a conversa (RETURNED_BY_ANALYST, instrucao condicional, prefixo [Analista])
metadata:
  type: project
---

Depois da primeira devolucao por um analista (`AgentTurnInput.returnedFromAnalyst`), pelo resto da conversa o agent nao oferece analista e so transfere por pedido explicito. Aprovado pelo usuario em 2026-11-03.

**Why:** evitar loop de oferta/transferencia depois que um humano ja atendeu.

**How to apply:**
- A guarda e em codigo: `reasonFor` em transfer-to-analyst recusa com `RETURNED_BY_ANALYST`.
- Normalizacao do motivo (aprovada para TODAS as conversas em 2026-11-03): com `asksForPerson` o motivo vira `EMPLOYEE_REQUEST` mesmo que o modelo mande LOW_CONFIDENCE/OVERDUE (OVERDUE sem oferta + pedido explicito agora transfere em vez de OVERDUE_NOT_ACCEPTED). Excecao decidida: com oferta de vencido ativa, o aceite fica OVERDUE mesmo escrito como pedido ("Falar com um analista" e a propria resposta rapida da oferta).
- `suppressOverdueOffer` inclui `returnedFromAnalyst`; a instrucao condicional fica em `RETURNED_FROM_ANALYST_INSTRUCTIONS` (instructions.ts).
- O historico mostra ANALYST como `assistant` com prefixo `[Analista]`; `composeReply` remove esse prefixo se o modelo copiar.
- Pegadinha de teste: "Obrigado!" e lido como recusa por `declinesPerson` (resposta curta comecando com obrigado); nao use como mensagem neutra.
- Eval real: `npm run eval:agent -- returned` (3 casos, ~8 chamadas no flash-lite; passou 3/3 em 2026-11-03). O caso de relato vago gastou 4 passos/12k tokens (search + draftReopen + draftTicket).
- Corrida conhecida (aceita pelo usuario): duas mensagens quase simultaneas, a primeira transfere, a segunda cai em 409 no `completeTurn`. Nao tem solucao do lado do agent; seria no ConversationService (guardar como STORED_FOR_ANALYST).
