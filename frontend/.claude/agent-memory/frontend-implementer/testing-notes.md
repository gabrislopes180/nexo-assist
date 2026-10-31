---
name: testing-notes
description: Como testar o frontend, incluindo vitest@4, Newsreader opsz 16, processo filho residual e banco temporário quando o dev.db diverge do seed
metadata:
  type: project
---

Testes: `npm test` (Vitest, sem DOM). Ficou na v4 porque a v5 exige `@types/node` 22 ou superior. Frontend em `:3000`, API em `:8000`.

**Why:** ao parar `npm run dev` do backend ou do frontend, o processo filho pode continuar na porta. Em 2026-10-31 o `backend/dev.db` local estava anterior ao seed, com Ana e Rafael em papéis trocados.

**How to apply:** confira a porta com `netstat` depois de parar um servidor. Para o roteiro sem tocar no `dev.db`, use `DATABASE_URL` apontando para um arquivo temporário com `prisma migrate deploy` e `prisma db seed`. Capturas para comparar devem vir de `next start`, sem indicador de dev. O título do login só bate com `01-login.png` com a Newsreader estática (opsz 16).
