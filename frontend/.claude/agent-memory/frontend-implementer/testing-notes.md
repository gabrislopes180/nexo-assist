---
name: testing-notes
description: Como testar o frontend, incluindo a pilha vitest@4, a Newsreader com opsz 16 e o processo filho do backend que sobrevive ao parar o npm
metadata:
  type: project
---

Testes: `npm test` (Vitest, sem DOM). Ficou na v4 porque a v5 exige `@types/node` 22 ou superior. Frontend em `:3000`, API em `:8000`.

**Why:** ao parar `npm run dev` do backend ou do frontend, o processo filho pode continuar na porta. O cenário de backend parado precisa confirmar a porta livre antes de valer.

**How to apply:** confira a porta com `netstat` depois de parar um servidor. O título do login só bate com `01-login.png` com a Newsreader estática (opsz 16); `axes: ["opsz"]` alarga o título em cerca de 14px.
