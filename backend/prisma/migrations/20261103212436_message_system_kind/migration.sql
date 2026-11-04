-- AlterTable
ALTER TABLE "Message" ADD COLUMN "systemKind" TEXT;

-- Backfill: as mensagens SYSTEM gravadas antes desta coluna, pelos textos fixos de
-- handoff.ts (HANDOFF_SYSTEM_MESSAGE) e attendance.ts (RETURN_SYSTEM_MESSAGE,
-- takeoverSystemMessage, closeSystemMessage). Nada além de SYSTEM é tocado.
UPDATE "Message" SET "systemKind" = 'HANDOFF' WHERE "authorType" = 'SYSTEM' AND "content" = 'Transferida para um analista';
UPDATE "Message" SET "systemKind" = 'RETURNED' WHERE "authorType" = 'SYSTEM' AND "content" = 'Conversa devolvida ao agent';
UPDATE "Message" SET "systemKind" = 'TAKEOVER' WHERE "authorType" = 'SYSTEM' AND "systemKind" IS NULL AND "content" GLOB '* assumiu a conversa';
UPDATE "Message" SET "systemKind" = 'CLOSED' WHERE "authorType" = 'SYSTEM' AND "systemKind" IS NULL AND "content" GLOB '* encerrou o atendimento';
