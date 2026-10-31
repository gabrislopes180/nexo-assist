---
name: shadcn-add-gotchas
description: O `shadcn add` neste projeto importa do pacote npm `cn`, omite radix-ui e cva do package.json, e o tailwind-merge descarta estilos de texto sem configuração
metadata:
  type: project
---

Depois de `npx shadcn@latest add`, revise a saída: em 2026-10-31 ele gerou `import { cn } from "cn"`, instalou o pacote npm `cn` e não adicionou `radix-ui` nem `class-variance-authority` ao package.json.

**Why:** o projeto centraliza `cn()` em `@/shared/lib/utils`, que tem `extendTailwindMerge`. Sem essa extensão, `text-heading` some ao lado de `text-on-ink`.

**How to apply:** troque o import, rode `npm rm cn` e instale as dependências que faltarem. Ao criar um estilo de texto em `globals.css`, adicione o nome à lista em `utils.ts`.
