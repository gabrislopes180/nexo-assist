---
name: project-test-quirks
description: Arquivos de teste que usam transação às vezes caem com 0xC0000005 (exit 3221225477) no Windows, com subtestes verdes; git stash pop deixa arquivos em CRLF
metadata:
  type: project
---

`npm test` (tsx --test, não vitest) às vezes marca um arquivo inteiro como `not ok` com `exitCode: 3221225477` e todos os subtestes verdes. A causa é o libsql ao encerrar o processo (documentado em `src/db/test-database.ts`), e o arquivo muda a cada execução.

**Why:** visto em 2026-11-03 em chat-handoff-routes, chat-reopen-routes e conversation-service; rodando o arquivo sozinho passa.

**How to apply:** antes de investigar uma falha "de arquivo", veja se o `exitCode` é 3221225477 e rode de novo; reporte ao usuário pelo nome se persistir. Scripts de edição: o ambiente não tem Python; use node ou a ferramenta Edit.

**Fins de linha:** os fontes estão em LF, mas `git stash`/`stash pop` (core.autocrlf) os devolve em CRLF. Em 2026-11-03 isso quebrou um script de edição por casamento exato. Para provar que um teste falha sem a correção, prefira copiar o arquivo para o scratchpad e restaurar, ou normalize para LF depois do pop.
