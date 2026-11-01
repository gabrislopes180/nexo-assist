import { setTimeout as delay } from "node:timers/promises";
import { TicketServiceUnavailableError, type TicketCodeReader, type TicketService } from "./ticket-service.js";

type FullTicketService = TicketService & TicketCodeReader;

export type ResilienceOptions = { timeoutMs: number; attempts: number; retryDelayMs: number };

const DEFAULT_RESILIENCE: ResilienceOptions = { timeoutMs: 3000, attempts: 2, retryDelayMs: 100 };

/** Encerrar pelo timeout não cancela a tentativa; o `race` já trata a rejeição tardia dela. */
async function withTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
  });
  try {
    return await Promise.race([operation(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Timeout e retry por tentativa. Qualquer falha vira erro tipado, sem detalhe interno. */
async function withRetry<T>(operation: () => Promise<T>, options: ResilienceOptions): Promise<T> {
  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    try {
      return await withTimeout(operation, options.timeoutMs);
    } catch {
      if (attempt < options.attempts) await delay(options.retryDelayMs);
    }
  }
  throw new TicketServiceUnavailableError();
}

export function createResilientTicketService(service: FullTicketService, options: ResilienceOptions = DEFAULT_RESILIENCE): FullTicketService {
  return {
    lookupOpenTickets: (ownerId, criteria, now) => withRetry(() => service.lookupOpenTickets(ownerId, criteria, now), options),
    findOpenTicketByCode: (ownerId, code, now) => withRetry(() => service.findOpenTicketByCode(ownerId, code, now), options),
  };
}

/** Simula o legado fora do ar, para demonstrar o resultado `UNAVAILABLE`. */
export function createUnavailableTicketService(): FullTicketService {
  return {
    lookupOpenTickets: () => Promise.reject(new TicketServiceUnavailableError()),
    findOpenTicketByCode: () => Promise.reject(new TicketServiceUnavailableError()),
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
