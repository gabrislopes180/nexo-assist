---
name: activity-hidden-routes
description: Com cacheComponents, o Next mantém a rota anterior oculta no DOM, com estado de formulário e um segundo main
metadata:
  type: project
---

Com `cacheComponents`, a rota anterior fica em `<Activity>` oculta: inputs mantêm valor e `main` conta duas vezes no DOM. Efeitos são desfeitos ao ocultar, então limpeza em cleanup funciona.

**Why:** a senha digitada no login ficava no DOM durante a sessão e voltava preenchida após sair; `login-form.tsx` agora chama `reset()` no cleanup.

**How to apply:** limpe em cleanup qualquer formulário com dado sensível. Em testes de navegador, use `main:visible`. Rotas protegidas no cliente exportam `instant = false` na própria `page.tsx`, senão o dev mostra erro que bloqueia cliques.
