import { TICKET_CODE_PATTERN, type ChangeTicketStatusRequest, type ChangeTicketStatusResponse, type ConsoleTicketDetail } from "../shared/console-tickets.js";
import type { SessionUser } from "../shared/session.js";
import type { TicketChangePublisher } from "../shared/ticket-events.js";
import type { TicketAvailability } from "../tickets/ticket-service.js";
import { TicketNotFoundError, type TicketStatusService } from "../tickets/ticket-status-service.js";
import { assertAnalyst } from "./console-service.js";

/** Gestão de chamados pelo console, centrada no chamado (não na conversa). */
export type ConsoleTicketService = {
  getTicket(actor: SessionUser, code: string): Promise<ConsoleTicketDetail>;
  changeStatus(actor: SessionUser, code: string, input: ChangeTicketStatusRequest): Promise<ChangeTicketStatusResponse>;
};

type ConsoleTicketServiceDeps = {
  statuses: TicketStatusService;
  /** O wrapper resiliente (timeout, retry e TICKET_SERVICE_SIMULATION=down). */
  availability: TicketAvailability;
  publisher: TicketChangePublisher;
  now?: () => Date;
};

function assertTicketCode(code: string): void {
  if (!TICKET_CODE_PATTERN.test(code)) throw new TicketNotFoundError();
}

/**
 * Qualquer analista lê e muda qualquer chamado; o ator vem só da sessão e fica no evento.
 * Publica `tickets.changed` só depois do commit e só quando algo mudou.
 */
export function createConsoleTicketService({ statuses, availability, publisher, now = () => new Date() }: ConsoleTicketServiceDeps): ConsoleTicketService {
  return {
    async getTicket(actor, code) {
      assertAnalyst(actor);
      assertTicketCode(code);
      await availability.ensureAvailable();
      return statuses.getDetail(code, now());
    },

    async changeStatus(actor, code, { toStatus, expectedStatus, note, conversationId }) {
      assertAnalyst(actor);
      assertTicketCode(code);
      await availability.ensureAvailable();
      const result = await statuses.changeStatus({
        code,
        actor: { id: actor.id, name: actor.name },
        toStatus,
        expectedStatus,
        note: note ?? null,
        conversationId: conversationId ?? null,
        now: now(),
      });
      if (result.changed) {
        publisher.publishTicketChange({ ownerId: result.ownerId, ticketCode: result.ticketCode, conversationId: result.conversationId });
      }
      return { ticket: await statuses.getDetail(code, now()), changed: result.changed };
    },
  };
}
