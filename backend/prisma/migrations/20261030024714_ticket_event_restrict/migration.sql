-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TicketEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "content" TEXT,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "fromPriority" TEXT,
    "toPriority" TEXT,
    "dueAt" DATETIME,
    "conversationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TicketEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TicketEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TicketEvent" ("actorId", "actorType", "content", "conversationId", "createdAt", "dueAt", "fromPriority", "fromStatus", "id", "ticketId", "toPriority", "toStatus", "type") SELECT "actorId", "actorType", "content", "conversationId", "createdAt", "dueAt", "fromPriority", "fromStatus", "id", "ticketId", "toPriority", "toStatus", "type" FROM "TicketEvent";
DROP TABLE "TicketEvent";
ALTER TABLE "new_TicketEvent" RENAME TO "TicketEvent";
CREATE INDEX "TicketEvent_ticketId_createdAt_idx" ON "TicketEvent"("ticketId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- A redefinição acima apaga a tabela antiga e, com ela, o trigger de append-only. Recria (mesmo SQL da init).
-- TicketEvent é append-only: bloqueia UPDATE (DELETE continua liberado para o seed)
CREATE TRIGGER "ticket_event_no_update" BEFORE UPDATE ON "TicketEvent" BEGIN SELECT RAISE(ABORT, 'TicketEvent is append-only'); END;
