---
name: project-seed-readme-quirks
description: Inconsistencias conhecidas entre README e seed do nexo-assist (papeis dos usuarios demo, conversa C3 com dono analista)
metadata:
  type: project
---

Em 2026-11-03: o seed tem Rafael Lima e Bruno Martins como ANALYST e Ana Souza como EMPLOYEE, mas o README listava rafael como funcionario e ana como analista. A conversa C3 do seed tem dono Rafael (ANALYST) e esta WITH_ANALYST com Bruno; Rafael nao consegue usar POST /chat (so EMPLOYEE).

**Why:** o seed e a fonte de verdade (o `verify` passa e o frontend mock copia C3); mudar o dono de C3 mexeria nos chamados INC-20398/INC-20405.
**How to apply:** nao usar Rafael como funcionario em roteiros de teste; demos do lado do funcionario usam Marina, Juliana ou Ana. O plano do console manda corrigir a tabela de usuarios do README.
