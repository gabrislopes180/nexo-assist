---
name: project-ticket-management-demo
description: Demo state for analyst ticket management (Plano 1, 2026-11-03): INC-20405 stays WAITING_ANALYST on seed-conv-with-analyst; curl tests mutate dev.db, so reseed afterwards
metadata:
  type: project
---

Plano 1 (analyst ticket management) was implemented on 2026-11-03 without a commit, per the user's request. Demo: Bruno opens `seed-conv-with-analyst` (C3, owner Rafael) and moves INC-20405 out of WAITING_ANALYST. The demo uses INC-20405 instead of the plan's suggested INC-20410 because C2 has to stay WAITING_ANALYST: seed verify requires one waiting conversation per handoff reason, CRITICAL included.

**Why:** seed verify enforces these invariants, and it now also checks that ANALYST events have an analyst author and EMPLOYEE events come from the owner.

**How to apply:** after exercising the endpoints with curl against dev.db, run `npm run db:seed` so the demo ticket goes back to WAITING_ANALYST. The user often has their own backend on :8000; start yours on another port (e.g. PORT=8123). On Windows, TaskStop leaves the tsx child process running, so kill it by the PID listening on that port. See also [[project-test-quirks]].
