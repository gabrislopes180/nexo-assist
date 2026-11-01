import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TicketLookupResult } from "../shared/chat.js";
import {
  createResilientTicketService,
  createTicketServiceFromEnv,
  createUnavailableTicketService,
} from "./resilient-ticket-service.js";
import { TicketServiceUnavailableError, type TicketCodeReader, type TicketService } from "./ticket-service.js";

const NOW = new Date("2026-11-01T12:00:00.000Z");
const RESULT: TicketLookupResult = { outcome: "NO_OPEN_TICKETS", openTicketCount: 0, totalMatches: 0, tickets: [] };
const FAST = { timeoutMs: 20, attempts: 2, retryDelayMs: 1 };

/** Cada chamada executa o próximo passo do roteiro e conta as tentativas. */
function scripted(...steps: Array<() => Promise<TicketLookupResult>>) {
  const calls: unknown[][] = [];
  const service: TicketService & TicketCodeReader = {
    findOpenTicketByCode: () => Promise.reject(new Error("não usado aqui")),
    lookupOpenTickets(...args) {
      calls.push(args);
      const step = steps[calls.length - 1];
      if (!step) throw new Error("chamada não prevista");
      return step();
    },
  };
  return { service, calls };
}

const fails = () => Promise.reject(new Error("detalhe interno"));
const hangs = () => new Promise<TicketLookupResult>(() => undefined);
const succeeds = () => Promise.resolve(RESULT);

describe("createResilientTicketService", () => {
  it("repassa os argumentos e devolve o resultado sem retry no sucesso", async () => {
    const { service, calls } = scripted(succeeds);
    const criteria = { code: "INC-1" };
    assert.equal(await createResilientTicketService(service, FAST).lookupOpenTickets("dono", criteria, NOW), RESULT);
    assert.deepEqual(calls, [["dono", criteria, NOW]]);
  });

  it("tenta de novo uma vez depois de uma falha", async () => {
    const { service, calls } = scripted(fails, succeeds);
    assert.equal(await createResilientTicketService(service, FAST).lookupOpenTickets("dono", {}, NOW), RESULT);
    assert.equal(calls.length, 2);
  });

  it("tenta de novo depois de um timeout", async () => {
    const { service, calls } = scripted(hangs, succeeds);
    assert.equal(await createResilientTicketService(service, FAST).lookupOpenTickets("dono", {}, NOW), RESULT);
    assert.equal(calls.length, 2);
  });

  it("espera o intervalo entre as tentativas", async () => {
    const { service } = scripted(fails, succeeds);
    const startedAt = Date.now();
    await createResilientTicketService(service, { ...FAST, retryDelayMs: 40 }).lookupOpenTickets("dono", {}, NOW);
    assert.ok(Date.now() - startedAt >= 35);
  });

  it("lança erro tipado depois de esgotar as tentativas, sem repassar o detalhe", async () => {
    const { service, calls } = scripted(fails, fails);
    await assert.rejects(
      createResilientTicketService(service, FAST).lookupOpenTickets("dono", {}, NOW),
      (error: Error) => error instanceof TicketServiceUnavailableError && !error.message.includes("detalhe interno"),
    );
    assert.equal(calls.length, 2);
  });

  it("lança erro tipado se todas as tentativas estouram o tempo", async () => {
    const { service, calls } = scripted(hangs, hangs);
    await assert.rejects(createResilientTicketService(service, FAST).lookupOpenTickets("dono", {}, NOW), TicketServiceUnavailableError);
    assert.equal(calls.length, 2);
  });

  it("não quebra o processo se a tentativa abandonada falhar depois do timeout", async () => {
    const { service } = scripted(
      () => new Promise((_resolve, reject) => setTimeout(() => reject(new Error("tarde")), 30)),
      succeeds,
    );
    assert.equal(await createResilientTicketService(service, FAST).lookupOpenTickets("dono", {}, NOW), RESULT);
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
});

describe("findOpenTicketByCode resiliente", () => {
  it("tenta de novo e devolve o resultado", async () => {
    let calls = 0;
    const { service } = scripted();
    const flaky = {
      ...service,
      findOpenTicketByCode: () => (++calls === 1 ? Promise.reject(new Error("falha")) : Promise.resolve(null)),
    };
    assert.equal(await createResilientTicketService(flaky, FAST).findOpenTicketByCode("dono", "INC-1", NOW), null);
    assert.equal(calls, 2);
  });

  it("lança erro tipado depois de esgotar as tentativas", async () => {
    const { service } = scripted();
    await assert.rejects(createResilientTicketService(service, FAST).findOpenTicketByCode("dono", "INC-1", NOW), TicketServiceUnavailableError);
  });

  it("com a simulação down também fica indisponível", async () => {
    const { service } = scripted();
    const simulated = createTicketServiceFromEnv(service, { TICKET_SERVICE_SIMULATION: "down" }, FAST);
    await assert.rejects(simulated.findOpenTicketByCode("dono", "INC-1", NOW), TicketServiceUnavailableError);
  });
});

describe("simulação de indisponibilidade", () => {
  it("createUnavailableTicketService sempre falha com erro tipado, sem chamar o serviço", async () => {
    await assert.rejects(createUnavailableTicketService().lookupOpenTickets("dono", {}, NOW), TicketServiceUnavailableError);
  });

  it("com o padrão off usa o serviço real", async () => {
    const { service } = scripted(succeeds);
    assert.equal(await createTicketServiceFromEnv(service, {}).lookupOpenTickets("dono", {}, NOW), RESULT);
  });

  it("com down falha com erro tipado", async () => {
    const { service, calls } = scripted();
    const simulated = createTicketServiceFromEnv(service, { TICKET_SERVICE_SIMULATION: "down" }, FAST);
    await assert.rejects(simulated.lookupOpenTickets("dono", {}, NOW), TicketServiceUnavailableError);
    assert.equal(calls.length, 0);
  });

  it("recusa valor desconhecido citando o nome da variável", () => {
    const { service } = scripted();
    assert.throws(() => createTicketServiceFromEnv(service, { TICKET_SERVICE_SIMULATION: "lento" }), /TICKET_SERVICE_SIMULATION/);
  });

  it("recusa down em produção", () => {
    const { service } = scripted();
    const env = { TICKET_SERVICE_SIMULATION: "down", NODE_ENV: "production" };
    assert.throws(() => createTicketServiceFromEnv(service, env), /TICKET_SERVICE_SIMULATION/);
  });

  it("aceita off em produção", () => {
    const { service } = scripted();
    assert.doesNotThrow(() => createTicketServiceFromEnv(service, { TICKET_SERVICE_SIMULATION: "off", NODE_ENV: "production" }));
  });
});
