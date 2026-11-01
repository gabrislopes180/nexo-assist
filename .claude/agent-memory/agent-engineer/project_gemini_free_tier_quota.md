---
name: gemini-free-tier-quota
description: A chave do projeto é Free Tier do Gemini, com 20 requisições por dia por modelo nos flash; cada turno com tool gasta 2. Limita medições e demonstração.
metadata:
  type: project
---

Em 2026-11-01 a `LLM_API_KEY` respondeu 429 `GenerateRequestsPerDayPerProjectPerModel-FreeTier`, valor 20, para `gemini-3.8-flash` e `gemini-3.7-flash`. O `gemini-3.5-flash-lite` passou de 20 no mesmo dia sem 429, então o limite dele parece maior (não confirmado). O reset fica por volta de 05:00 BRT.

**Why:** cada turno com tool são 2 requisições, então 20/dia dá cerca de 10 turnos por modelo. A cota esgotada vira 503 `AGENT_UNAVAILABLE`, e `maxRetries: 1` gasta mais uma requisição no 429.

**How to apply:** antes de medir, consulte a cota com uma chamada e planeje o orçamento por modelo. Prefira testes com modelo fake; rode `npm run eval:agent` só quando precisar. Veja [[mastra-agent-gotchas]].
