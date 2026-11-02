---
name: project-db-gotchas
description: Non-obvious Prisma 7 + libsql/SQLite behaviors in nexo-assist backend (trigger error mapping, table redefinition drops triggers, no migrate reset, scratch scripts on Windows)
metadata:
  type: project
---

- The `ticket_event_no_update` trigger (TicketEvent append-only) does fire, but the libsql adapter classifies RAISE(ABORT) (SQLite code 1811, SQLITE_CONSTRAINT_TRIGGER) as `ForeignKeyConstraintViolation`, so Prisma throws **P2003** (P2010 via raw). The real reason is in `err.meta.driverAdapterError.cause.originalMessage` = "SQLITE_CONSTRAINT: TicketEvent is append-only" (a real FK failure says "FOREIGN KEY constraint failed").
  **Why:** misleading error would send debugging toward FKs.
  **How to apply:** services must never update TicketEvent; if a P2003 appears on TicketEvent, check originalMessage first.
- Any migration that changes TicketEvent columns/FKs makes Prisma redefine the table on SQLite (new table, copy, DROP, RENAME), which **drops the trigger**. Append the `CREATE TRIGGER "ticket_event_no_update" ...` SQL (copy from the init migration) at the end of such a migration (done in `ticket_event_restrict`, 2026-10-29).
  **Why:** losing the trigger silently removes the append-only guarantee; `migrate dev` reports no drift because Prisma does not track triggers.
  **How to apply:** after `--create-only`, grep the new migration for `new_TicketEvent`; if present, re-add the trigger before applying.
- TicketEvent FKs are all ON DELETE RESTRICT (SetNull would run an UPDATE and hit the trigger). They are still ON UPDATE CASCADE, so changing a User/Conversation/Ticket id would also hit the trigger; ids are never updated, keep it that way.
- `prisma migrate reset` is blocked for AI agents; the seed (`npm run db:seed`) wipes and reinserts in one transaction, so it never needs a reset.
- `src/db/prisma.ts` uses plain `dotenv/config` and does NOT call `resolveDatabaseUrl` (src/db/database-url.ts exists, tested but unused as of 2026-10-30), so `file:./dev.db` depends on cwd: run from backend/. From another cwd libsql silently creates an empty DB there and the boot `SELECT 1` still passes.
- To validate the destructive seed safely: copy dev.db to the scratchpad and set `DATABASE_URL=file:///...copy.db` when running `tsx src/db/seed.ts` (dotenv does not override an existing env var).
- libsql keeps the db file open on Windows after `$disconnect` (rmSync gives EBUSY). `:memory:` does NOT work with `$transaction`: libsql opens a new connection per transaction, which sees an empty db ("no such table"). So `createTestDatabase()` uses a temp file (old `nexo-test-*.db` swept after 1h).
- Processes that ran `$transaction` sometimes segfault at exit (Windows, `exitCode: 3221225477`/139, file-level failure with all subtests green). Measured 2026-11-01: about 50% after 1000 transactions, about 1/25 for a single test file. Zero crashes during 6000 transactions with forced GC: every crash came after `$disconnect`, so work is already saved. It is NOT caused by `?cache=shared` (an early wrong conclusion), and `process.exit` in `beforeExit` does not help. Likely native teardown of the connections libsql orphans per transaction (`#db = null`); root cause unconfirmed.
  **Why:** looks like a broken test, but it is teardown; a server only sees it at shutdown.
  **How to apply:** check `exitCode` before debugging domain code; measure by repeating, not one run. A real fix likely needs a libsql/adapter change.
- Throwaway tsx scripts outside backend/ still need `.mts` (top-level await) and `file:///C:/...` import URLs on Windows; bare package imports (e.g. `@libsql/client`) don't resolve from %TEMP%, import by absolute file URL.
- Seed timestamps are relative to `now`; overdue/on-time status is guaranteed via SLA_ELAPSED_BOUNDS_HOURS in src/tickets/sla.ts. See [[ticket-sla-rules]].
