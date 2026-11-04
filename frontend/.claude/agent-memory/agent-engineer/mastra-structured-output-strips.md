---
name: mastra-structured-output-strips
description: In nexo-assist backend, a new field in the LLM decision JSON must be added to llmDecisionSchema (Mastra structuredOutput) AND lenientDecisionSchema, or it is silently dropped
metadata:
  type: project
---

`agent-runner.ts` passes `llmDecisionSchema` (a plain `z.object`) as Mastra `structuredOutput.schema` with `jsonPromptInjection: "system"` and `errorStrategy: "warn"`. `output.object` is the parsed object, so unknown keys are stripped; an invalid value makes `object` undefined and `parseDecision` falls back to the raw text JSON through `lenientDecisionSchema` (`.optional().catch(undefined)` per field).

**Why:** found while adding `redirectTo` (Plano 3, 2026-11-03). A runner test with the fake model (`decisions` through `createAgentRunner`) proves the field survives; a pure `composeReply` test would not.

**How to apply:** any new decision field (e.g. Plano 2 `articleSlug`) goes in both schemas, in `STRUCTURED_OUTPUT_INSTRUCTIONS`, and gets one runner-level test. `agentTraceSchema` is strictObject: express new agent behavior as an `actions` entry or an `.optional()` field. See [[out-of-scope-redirect-decisions]].
