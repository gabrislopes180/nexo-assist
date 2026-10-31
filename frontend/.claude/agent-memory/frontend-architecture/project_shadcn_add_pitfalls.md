---
name: project-shadcn-add-pitfalls
description: Armadilhas de `shadcn add` neste repositório (import de "cn", sobrescrita do Button, colisão de --sidebar-width), vistas em dry-run em 2026-10-31
metadata:
  type: project
---

`npx shadcn@latest add sidebar`, com o `components.json` atual, adiciona o pacote indevido `cn`, gera `import { cn } from "cn"`, propõe sobrescrever `src/shared/ui/button.tsx` e define `--sidebar-width: 16rem` inline, anulando o token de 232px. O `bg-sidebar` não existe no tema.

**Why:** o `add` não altera erro de tipo nem visual de forma visível; o pacote `cn` e a sobrescrita passariam despercebidos num `--yes`.

**How to apply:** rode `--dry-run` antes, nunca use `--yes` ou `--overwrite` em componente que puxa `button`, recuse a sobrescrita e confira depois `package.json`, `globals.css` e os imports. Causa raiz do `cn` não investigada.
