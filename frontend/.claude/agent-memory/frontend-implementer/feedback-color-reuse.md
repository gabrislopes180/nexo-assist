---
name: feedback-color-reuse
description: Antes de criar token de cor, reaproveitar cor existente igual ou muito parecida, comparando o valor composto sobre o fundo real
metadata:
  type: feedback
---

Só crie token de cor se não houver equivalente em `app/globals.css` e `docs/design-system/tokens.json`, mesmo que a existente seja levemente diferente.

**Why:** regra do usuário, para manter a paleta enxuta.

**How to apply:** tokens translúcidos devem ser comparados depois de compostos sobre o fundo real. Foi assim que `on-ink-rule` (#323a46 sobre ink) substituiu uma cor proposta de #343c48. Informe na entrega o que reaproveitou, o que criou e os valores comparados.
