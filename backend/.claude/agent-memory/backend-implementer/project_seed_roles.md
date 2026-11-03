---
name: project-seed-roles
description: Papéis corretos dos usuários de demonstração vêm de src/db/seed-data/users.ts; o README foi alinhado a ele em 2026-11-03
metadata:
  type: project
---

Os papéis corretos são os de `src/db/seed-data/users.ts`: Marina, Juliana e Ana = EMPLOYEE; Rafael e Bruno = ANALYST. O README dizia o contrário e foi corrigido em 2026-11-03 (plano do console aprovado pelo usuário), substituindo a decisão de 2026-10-30 de manter a divergência.

**Why:** o seed é a fonte de verdade; o plano do console (backend-architecture) pediu o README alinhado.

**How to apply:** se seed e README divergirem de novo, o seed vale. Não fixe nomes ou papéis do seed em testes de serviço/rota; crie usuários próprios no banco temporário. A conversa C3 do seed tem dono analista (Rafael): não use o Rafael como funcionário em roteiros.
