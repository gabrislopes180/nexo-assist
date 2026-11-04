---
name: returned-from-analyst-policy
description: Retomada apos devolucao do analista com criterios normais de transferencia e prefixo [Analista]
metadata:
  type: project
---

Depois da devolucao por um analista (`AgentTurnInput.returnedFromAnalyst`), o agent segue os criterios normais: EMPLOYEE_REQUEST por pedido explicito, LOW_CONFIDENCE por falta de seguranca e OVERDUE com oferta por vencimento aceita. A restricao geral apos devolucao foi removida a pedido do usuario em 2026-11-04.

**Why:** a passagem anterior por um humano nao deve bloquear uma nova transferencia valida; recusas e aceites continuam sendo conferidos.

**How to apply:**
- `resolvedReason` em transfer-to-analyst confere pedido, recusa e aceite sem restricao por devolucao anterior. As rejeicoes sao transitorias; o trace persistido guarda apenas a descricao em texto livre.
- Normalizacao do motivo (aprovada para TODAS as conversas em 2026-11-03): com `asksForPerson` o motivo vira `EMPLOYEE_REQUEST` mesmo que o modelo mande LOW_CONFIDENCE/OVERDUE (OVERDUE sem oferta + pedido explicito agora transfere em vez de OVERDUE_NOT_ACCEPTED). Excecao decidida: com oferta de vencido ativa, o aceite fica OVERDUE mesmo escrito como pedido ("Falar com um analista" e a propria resposta rapida da oferta).
- `suppressOverdueOffer` considera somente recusa atual ou recente. `returnedFromAnalyst` inclui o contexto de autoria e continuidade em `RETURNED_FROM_ANALYST_INSTRUCTIONS` (instructions.ts), sem restringir motivos de transferencia.
- O historico mostra ANALYST como `assistant` com prefixo `[Analista]`; `composeReply` remove esse prefixo se o modelo copiar.
- Pegadinha de teste: "Obrigado!" e lido como recusa por `declinesPerson` (resposta curta comecando com obrigado); nao use como mensagem neutra.
- Eval real: `npm run eval:agent -- returned` agora cobre oferta, relato vago (esclarecimento/rascunho ou LOW_CONFIDENCE), pedido explicito, dois aceites OVERDUE e recusa. Nao foi executado nesta alteracao; a validacao solicitada usa somente modelo fake.
- Corrida conhecida (aceita pelo usuario): duas mensagens quase simultaneas, a primeira transfere, a segunda cai em 409 no `completeTurn`. Nao tem solucao do lado do agent; seria no ConversationService (guardar como STORED_FOR_ANALYST).
