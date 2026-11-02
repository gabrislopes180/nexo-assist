---
name: project-analyst-console-decisions
description: Decisoes de arquitetura do console do analista (tela 04), planejado em 2026-11-02 com dados mockados; rota, camada de mock, contrato proposto e desvios do prototipo
metadata:
  type: project
---

Console do analista (tela 04) planejado em 2026-11-02, com mocks enquanto o backend nao tem API de console.

- Rota `/console/analyst` em grupo proprio `app/(console)/` (sem a sidebar de 232px do `(authenticated)`); `homePathFor("ANALYST")` passa a ser `/console/analyst`.
- Mock fica atras de `consoleRequest` em `shared/api/console-request.ts` + `shared/api/console-mock/` (fixtures, handlers, cenarios `?mock=`), trocado por `NEXT_PUBLIC_CONSOLE_API=real`. Respostas sempre validadas pelos schemas Zod das entities.
- Contrato proposto ao backend: GET `/console/conversations`, `/:id`, `/:id/messages`, `/:id/tickets`; POST `/:id/takeover` e `/:id/return` (409 `CONVERSATION_NOT_WAITING`). Campo `assignedToMe` calculado pelo servidor para evitar comparar ids no mock.
- Sem semantica inventada: presenca online, "digitando", nao lidas, ticks de lida, "Disponivel", fila "Suporte N2" e "contato em 25 min" foram omitidos; "confianca 41%" virou rotulo de HIGH/MEDIUM/LOW; departamento vem de `User.department`.
- Prototipo e internamente inconsistente (chip "Para voce" ativo listando tudo; contadores 9/1 e badge 5 estaticos). Decisao: filtro padrao "Todas" e contadores derivados dos dados.
- Bolha do cliente no console ocupa a largura da coluna (como nas telas 04/05), apesar do `components.css` limitar a 420px.

**Why:** o usuario pediu fidelidade a tela, mas sem inventar dados que o backend nao tera; o plano vai direto ao implementer sem nova consulta.
**How to apply:** ao planejar a tela 05 (atendimento assumido) ou ligar a API real, partir deste contrato e desta camada de mock; nao reabrir as decisoes de omissao sem dado novo do backend. Ver [[project-prototype-inconsistencies]].
