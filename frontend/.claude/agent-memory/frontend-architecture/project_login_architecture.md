---
name: project-login-architecture
description: Autenticação e área logada do frontend: sessão por cookie via rewrite, rotas por papel, camada processes e comportamento medido do rewrite do Next 16.4.3
metadata:
  type: project
---

Login implementado com cookie via rewrite `/api/*`. Plano de 2026-10-31 para a área logada, ainda sem confirmação de execução: `/console/employee`, `/profile` e sidebar em `src/processes/layouts/sidebar.tsx`, pedido explícito do usuário. `/console/analyst` fica para depois; até lá recomendei enviar o analista para `/profile`. Testes de produção e Vercel só depois do produto pronto localmente.

**Why:** o cookie é host-only e `SameSite=Lax`; o rewrite o torna first-party. `processes` entra entre `app` e `pages` na ordem do FSD. O `proxy.ts` não conhece o papel, então a guarda de papel é no cliente.

**Backend em 2026-10-31:** só `/health` e `/auth/*`. `src/agent` está vazio, Mastra não está instalado, e não há rota de conversa, mensagem ou chamado. Confira o código antes de tratar isso como atual.

**Medido em Next 16.4.3 (`next start`):** o destino do rewrite congela em `next build`; backend parado responde 500 em texto; a compressão retém SSE até o fim (`Cache-Control: no-transform` resolve); sem bytes por 30 s o proxy corta. Não vale para Vercel.

**How to apply:** ao planejar o chat real, cubra compressão e heartbeat abaixo de 30 s. Confira `.env`, o `CLAUDE.md` e o código antes de reutilizar estas decisões. Ver [[project-shadcn-add-pitfalls]].
