import { withRetry as retry, type ResilienceOptions } from "../shared/resilience.js";
import { TicketServiceUnavailableError, type FullTicketService } from "./ticket-service.js";

export type { ResilienceOptions };

const DEFAULT_RESILIENCE: ResilienceOptions = { timeoutMs: 3000, attempts: 2, retryDelayMs: 100 };

const unavailable = () => new TicketServiceUnavailableError();

/** Qualquer falha vira erro tipado, sem detalhe interno. */
function withRetry<T>(operation: () => Promise<T>, options: ResilienceOptions): Promise<T> {
  return retry(operation, options, unavailable);
}

export function createResilientTicketService(service: FullTicketService, options: ResilienceOptions = DEFAULT_RESILIENCE): FullTicketService {
  return {
    lookupOpenTickets: (ownerId, criteria, now) => withRetry(() => service.lookupOpenTickets(ownerId, criteria, now), options),
    findOpenTicketByCode: (ownerId, code, now) => withRetry(() => service.findOpenTicketByCode(ownerId, code, now), options),
    findSimilarTickets: (ownerId, keywords, now, filter) =>
      withRetry(() => (filter ? service.findSimilarTickets(ownerId, keywords, now, filter) : service.findSimilarTickets(ownerId, keywords, now)), options),
    findResolvedTicketByCode: (ownerId, code, now) => withRetry(() => service.findResolvedTicketByCode(ownerId, code, now), options),
    listOwnerTickets: (ownerId, now) => withRetry(() => service.listOwnerTickets(ownerId, now), options),
    ensureAvailable: () => withRetry(() => service.ensureAvailable(), options),
  };
}

/** Simula o legado fora do ar, para demonstrar o resultado `UNAVAILABLE`. */
export function createUnavailableTicketService(): FullTicketService {
  return {
    lookupOpenTickets: () => Promise.reject(new TicketServiceUnavailableError()),
    findOpenTicketByCode: () => Promise.reject(new TicketServiceUnavailableError()),
    findSimilarTickets: () => Promise.reject(new TicketServiceUnavailableError()),
    findResolvedTicketByCode: () => Promise.reject(new TicketServiceUnavailableError()),
    listOwnerTickets: () => Promise.reject(new TicketServiceUnavailableError()),
    ensureAvailable: () => Promise.reject(new TicketServiceUnavailableError()),
  };
}

/**
 * Monta o serviço usado pela API. `TICKET_SERVICE_SIMULATION=off|down` (padrão off);
 * `down` é recusado em produção. Lança erro citando só o nome da variável.
 */
export function createTicketServiceFromEnv(
  service: FullTicketService,
  env: Record<string, string | undefined>,
  options: ResilienceOptions = DEFAULT_RESILIENCE,
): FullTicketService {
  const simulation = env.TICKET_SERVICE_SIMULATION ?? "off";
  const isValid = simulation === "off" || (simulation === "down" && env.NODE_ENV !== "production");
  if (!isValid) throw new Error("Configuração inválida: TICKET_SERVICE_SIMULATION");
  return createResilientTicketService(simulation === "down" ? createUnavailableTicketService() : service, options);
}
