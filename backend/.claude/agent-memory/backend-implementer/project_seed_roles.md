---
name: project-seed-roles
description: Papéis corretos dos usuários de demonstração vêm de src/db/seed-data/users.ts, não da frase do README
metadata:
  type: project
---

Os papéis corretos são os de `src/db/seed-data/users.ts` (Rafael = ANALYST, Ana = EMPLOYEE). A frase "Usuários de demonstração" do README diz o contrário e foi mantida de propósito.

**Why:** decisão do usuário em 2026-10-30 durante a feature de login simulado.

**How to apply:** não "corrija" seed nem README sem pedido, e não fixe nomes ou papéis do seed em testes; crie usuários próprios no banco `:memory:`.
