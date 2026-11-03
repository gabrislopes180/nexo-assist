import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { createTestDatabase } from "../db/test-database.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { ConversationStatus, MessageAuthorType } from "../generated/prisma/enums.js";
import type { AgentTrace } from "../shared/transparency.js";
import { CONSOLE_LIST_LIMIT, findForConsole, findOwnedForEmployee, listForConsole, listMessages } from "./conversation-queries.js";
import { ConversationNotFoundError } from "./conversation-rules.js";

const NOW = new Date("2026-11-03T12:00:00.000Z");
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
const TRACE = (confidence: AgentTrace["confidence"]): AgentTrace => ({ understood: "x", intent: "OTHER", actions: [], confidence, reason: "y" });

describe("conversation-queries", () => {
  let client: PrismaClient;
  let joao: string;
  let maria: string;
  let bruno: string;
  let rafael: string;

  async function conversation(owner: string, status: ConversationStatus, extra: Record<string, unknown> = {}) {
    const assigned = status === "WITH_ANALYST" ? { analystId: bruno, assignedAt: minutesAgo(30) } : {};
    const handoff =
      status === "WITH_AGENT" ? {} : { handoffReason: "EMPLOYEE_REQUEST" as const, handoffSummary: "Pediu analista.", handoffAt: minutesAgo(40) };
    return client.conversation.create({
      data: { ownerId: owner, status, lastMessageAt: minutesAgo(10), ...assigned, ...handoff, ...(status === "CLOSED" ? { closedAt: minutesAgo(10) } : {}), ...extra },
    });
  }

  async function message(conversationId: string, authorType: MessageAuthorType, content: string, at: Date, trace?: unknown) {
    await client.message.create({
      data: { conversationId, authorType, content, createdAt: at, ...(trace === undefined ? {} : { trace: trace as object }) },
    });
  }

  async function ticket(owner: string, code: string, conversationId?: string, at = minutesAgo(50)) {
    await client.ticket.create({
      data: {
        code,
        type: "INC",
        category: "HARDWARE",
        priority: "MEDIUM",
        status: "WAITING_ANALYST",
        title: `Chamado ${code}`,
        description: "d",
        affectedScope: "INDIVIDUAL",
        ownerId: owner,
        events: { create: { type: "CREATED", actorType: "EMPLOYEE", actorId: owner, toStatus: "WAITING_ANALYST", createdAt: at, conversationId: conversationId ?? null } },
      },
    });
  }

  const list = (filter: "all" | "waiting" | "with-agent" | "mine" = "all", q?: string, analystId = bruno) =>
    listForConsole(client, { now: NOW, filter, analystId, ...(q === undefined ? {} : { q }) });

  before(async () => {
    client = await createTestDatabase();
    joao = (await client.user.create({ data: { name: "João Pereira", email: "joao@teste.example", role: "EMPLOYEE" } })).id;
    maria = (await client.user.create({ data: { name: "Maria Lima", email: "maria@teste.example", role: "EMPLOYEE" } })).id;
    bruno = (await client.user.create({ data: { name: "Bruno Martins", email: "bruno@teste.example", role: "ANALYST" } })).id;
    rafael = (await client.user.create({ data: { name: "Rafael Lima", email: "rafael@teste.example", role: "ANALYST" } })).id;
  });

  beforeEach(async () => {
    await client.ticketEvent.deleteMany();
    await client.ticket.deleteMany();
    await client.conversation.deleteMany();
  });

  after(async () => {
    await client.$disconnect();
  });

  describe("listForConsole", () => {
    it("lastMessage ignora SYSTEM, e lastAgentConfidence vem da última AGENT", async () => {
      const { id } = await conversation(joao, "WAITING_ANALYST");
      await message(id, "AGENT", "primeira", minutesAgo(30), TRACE("LOW"));
      await message(id, "AGENT", "segunda", minutesAgo(25), TRACE("MEDIUM"));
      await message(id, "EMPLOYEE", "última da pessoa", minutesAgo(20));
      await message(id, "SYSTEM", "Transferida para um analista", minutesAgo(15));
      const [row] = await list();
      assert.deepEqual(row?.lastMessage, { authorType: "EMPLOYEE", content: "última da pessoa", createdAt: minutesAgo(20) });
      assert.equal(row?.lastAgentConfidence, "MEDIUM");
      assert.equal(row?.owner.name, "João Pereira");
    });

    it("trace inválido na última AGENT dá confiança null; sem mensagens, lastMessage null", async () => {
      const a = await conversation(joao, "WITH_AGENT");
      await message(a.id, "AGENT", "x", minutesAgo(20), { lixo: true });
      await conversation(maria, "WITH_AGENT", { lastMessageAt: minutesAgo(5) });
      const rows = await list();
      assert.equal(rows.find((r) => r.id === a.id)?.lastAgentConfidence, null);
      assert.equal(rows.find((r) => r.id !== a.id)?.lastMessage, null);
    });

    it("ticketCode vem do evento mais recente da conversa", async () => {
      const { id } = await conversation(joao, "WAITING_ANALYST");
      await ticket(joao, "INC-1", id, minutesAgo(50));
      await ticket(joao, "INC-2", id, minutesAgo(45));
      assert.equal((await list())[0]?.ticketCode, "INC-2");
    });

    it("sem evento, usa o primeiro código do resumo que seja do mesmo dono", async () => {
      await ticket(maria, "INC-7");
      await ticket(joao, "INC-8");
      await conversation(joao, "WAITING_ANALYST", { handoffSummary: "Fala do INC-7 da Maria e do inc-8 também. INC-8 vencido." });
      assert.equal((await list())[0]?.ticketCode, "INC-8");
    });

    it("sem evento nem código do dono no resumo, ticketCode null", async () => {
      await ticket(maria, "INC-7");
      await conversation(joao, "WAITING_ANALYST", { handoffSummary: "Fala do INC-7." });
      assert.equal((await list())[0]?.ticketCode, null);
    });

    it("inclui CLOSED só nas últimas 48 horas", async () => {
      const recent = await conversation(joao, "CLOSED", { closedAt: minutesAgo(47 * 60) });
      await conversation(maria, "CLOSED", { closedAt: minutesAgo(49 * 60) });
      assert.deepEqual((await list()).map((r) => r.id), [recent.id]);
    });

    it("filtra por waiting, with-agent e mine, e ordena por lastMessageAt desc", async () => {
      const waiting = await conversation(joao, "WAITING_ANALYST", { lastMessageAt: minutesAgo(3) });
      const agent = await conversation(maria, "WITH_AGENT", { lastMessageAt: minutesAgo(2) });
      const mine = await conversation(joao, "WITH_ANALYST", { lastMessageAt: minutesAgo(1) });
      const theirs = await conversation(maria, "WITH_ANALYST", { analystId: rafael, lastMessageAt: minutesAgo(4) });
      assert.deepEqual((await list()).map((r) => r.id), [mine.id, agent.id, waiting.id, theirs.id]);
      assert.deepEqual((await list("waiting")).map((r) => r.id), [waiting.id]);
      assert.deepEqual((await list("with-agent")).map((r) => r.id), [agent.id]);
      assert.deepEqual((await list("mine")).map((r) => r.id), [mine.id]);
      assert.deepEqual((await list("mine", undefined, rafael)).map((r) => r.id), [theirs.id]);
    });

    it("q busca no nome do dono sem acento e no código do chamado sem diferenciar caixa", async () => {
      const a = await conversation(joao, "WAITING_ANALYST");
      const b = await conversation(maria, "WAITING_ANALYST", { handoffSummary: "INC-20311 vencido." });
      await ticket(maria, "INC-20311");
      assert.deepEqual((await list("all", "joao")).map((r) => r.id), [a.id]);
      assert.deepEqual((await list("all", "inc-20311")).map((r) => r.id), [b.id]);
      assert.deepEqual(await list("all", "ninguém"), []);
    });

    it(`corta em ${CONSOLE_LIST_LIMIT} depois de ordenar no banco`, async () => {
      assert.equal(CONSOLE_LIST_LIMIT, 200);
      await client.conversation.createMany({
        data: Array.from({ length: 205 }, (_, i) => ({ ownerId: joao, status: "WITH_AGENT" as const, lastMessageAt: minutesAgo(i + 1) })),
      });
      const rows = await list();
      assert.equal(rows.length, 200);
      assert.deepEqual(rows[0]?.lastMessageAt, minutesAgo(1));
      assert.deepEqual(rows[199]?.lastMessageAt, minutesAgo(200));
    });
  });

  describe("leituras de uma conversa", () => {
    it("findForConsole devolve a mesma linha da lista, e 404 para inexistente", async () => {
      const { id } = await conversation(joao, "WITH_ANALYST");
      const row = await findForConsole(client, id);
      assert.equal(row.analyst?.name, "Bruno Martins");
      await assert.rejects(findForConsole(client, "nao-existe"), ConversationNotFoundError);
    });

    it("listMessages traz todas em ordem, com autor e trace só no AGENT", async () => {
      const { id } = await conversation(joao, "WITH_ANALYST");
      await client.message.create({ data: { conversationId: id, authorType: "ANALYST", authorId: bruno, content: "oi", createdAt: minutesAgo(5) } });
      await message(id, "AGENT", "resposta", minutesAgo(8), TRACE("HIGH"));
      await client.message.create({ data: { conversationId: id, authorType: "EMPLOYEE", authorId: joao, content: "pergunta", createdAt: minutesAgo(9) } });
      const messages = await listMessages(client, id);
      assert.deepEqual(messages.map((m) => [m.authorType, m.author?.name ?? null, m.trace?.confidence ?? null]), [
        ["EMPLOYEE", "João Pereira", null],
        ["AGENT", null, "HIGH"],
        ["ANALYST", "Bruno Martins", null],
      ]);
      await assert.rejects(listMessages(client, "nao-existe"), ConversationNotFoundError);
    });

    it("findOwnedForEmployee só acha a conversa do próprio dono", async () => {
      const { id } = await conversation(joao, "WITH_ANALYST");
      const found = await findOwnedForEmployee(client, joao, id);
      assert.equal(found.snapshot.analyst?.name, "Bruno Martins");
      await assert.rejects(findOwnedForEmployee(client, maria, id), ConversationNotFoundError);
    });
  });
});
