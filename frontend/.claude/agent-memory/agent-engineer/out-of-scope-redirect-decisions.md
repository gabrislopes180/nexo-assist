---
name: out-of-scope-redirect-decisions
description: Plano 3 (2026-11-03) out-of-scope redirect design in nexo-assist and the WAITING_EMPLOYEE status note; what worked in the real eval
metadata:
  type: project
---

- LLM only picks `redirectTo` (RH/FINANCEIRO/FACILITIES/null); with intent OUT_OF_SCOPE the reply is ALWAYS code text (`knowledge/redirect-targets.ts`), trace action `outOfScopeRedirect`. Contacts never go into the prompt (only area + `covers` examples), so the model cannot paraphrase them.
- Boundary rule in instructions ("sistema, acesso, equipamento ou software é TI mesmo quando cita outra área", with the two examples) made gemini-3.5-flash-lite pass 8/8 boundary cases on first try (~3k tokens/turn, ~1 s).
- WAITING_EMPLOYEE: the model ignored the "say the deadline is paused" instruction in the first real run and paraphrased "o analista aguarda sua resposta"; code appends the note, or only "O prazo fica pausado até lá." when the model already said the analyst is waiting (avoid duplicated sentence).

**Why:** user's rule — the LLM proposes, the code decides what is said when it is a fact/contact.
**How to apply:** Plano 2 (help center) must keep "fora de escopo nunca cita" — OUT_OF_SCOPE returns early in composeReply via `outOfScopeReply`. See [[mastra-structured-output-strips]].
