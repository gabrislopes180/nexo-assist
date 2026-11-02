---
name: project-prototype-inconsistencies
description: Onde as telas do prototipo (docs/design-system/screens) divergem de reference/components.css e dos tokens, e qual fonte venceu em cada caso
metadata:
  type: project
---

As telas renderizadas (screens/*.png) e a implementacao de referencia (reference/components.css) nem sempre concordam.

- Console: bolha do cliente estica na coluna nas telas; reference diz max 420px. Venceu a tela.
- Console: bolha curta do agent passa de 420px na tela (484px). Regra adotada: so a bolha `long` tem 420px fixos (`w-105`); a curta ajusta ao conteudo.
- Fonte 12px do reference (nome do remetente, evento, pilula de dia) nao existe nos tokens; usar `caption`/`caption-strong` (12,5px), que o tokens.json indica para remetente.
- Contadores, badge do rail e chip ativo da tela 04 sao estaticos e contraditorios entre si.
- Mensagens consecutivas do mesmo autor ficam a ~2px (pt-0.5), sem repetir o remetente.

**Why:** evitar re-medir e re-debater a cada tela do console.
**How to apply:** em planos de telas do console, conferir medidas na imagem (sharp em frontend/node_modules funciona para medir pixels) e registrar aqui novas divergencias. Relacionado: [[project-analyst-console-decisions]].
