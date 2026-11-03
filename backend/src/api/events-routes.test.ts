import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import { createApp } from "../app.js";
import { createAuthService } from "../auth/auth-service.js";
import { issueSessionToken, SESSION_TTL_SECONDS } from "../auth/session-token.js";
import type { AgentRunner } from "../chat/agent-runner.js";
import { createChatService } from "../chat/chat-service.js";
import { createConsoleService } from "../console/console-service.js";
import { createConversationQueries } from "../conversations/conversation-queries.js";
import { createConversationService } from "../conversations/conversation-service.js";
import { createTestDatabase } from "../db/test-database.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { ConversationStatus } from "../generated/prisma/enums.js";
import { createEventBus, type EventBus } from "../realtime/event-bus.js";
import { createFanout, type Fanout } from "../realtime/fanout.js";
import type { ChatResponse, ProposedTicketDraft } from "../shared/chat.js";
import type { AgentTrace } from "../shared/transparency.js";
import { createTicketService } from "../tickets/ticket-service.js";
import type { ApiConfig } from "./config.js";

const SECRET = "segredo-de-teste-com-mais-de-32-caracteres";
const config: ApiConfig = { sessionSecret: SECRET, corsOrigins: ["http://localhost:3000"], isProduction: false };
const TRACE: AgentTrace = { understood: "x", intent: "OPEN_TICKET", actions: [], confidence: "HIGH", reason: "y" };
const T0 = new Date(Date.now() - 60 * 60_000);
const CRITICAL_DRAFT: ProposedTicketDraft = {
  kind: "CREATE",
  type: "INC",
  category: "SOFTWARE",
  priority: "CRITICAL",
  priorityReason: "Filial parada.",
  title: "Ponto fora do ar",
  description: "Ninguém bate o ponto.",
  affectedScope: "COMPANY",
};

type Frame = { id?: string; event?: string; data?: string; comment?: string; retry?: string };

/** Lê o corpo do SSE e devolve um quadro por vez (separados por linha em branco). */
function sseReader(res: Response) {
  const body = res.body;
  if (!body) throw new Error("sem corpo");
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const queue: Frame[] = [];

  function parse(block: string): Frame {
    const frame: Frame = {};
    for (const line of block.split("\n")) {
      if (line.startsWith(":")) frame.comment = line.slice(1).trim();
      else {
        const index = line.indexOf(":");
        const field = line.slice(0, index);
        const value = line.slice(index + 1).replace(/^ /, "");
        if (field === "id" || field === "event" || field === "data" || field === "retry") frame[field] = value;
      }
    }
    return frame;
  }

  /** Próximo quadro; `null` quando o servidor encerra o stream. */
  async function next(timeoutMs = 3000): Promise<Frame | null> {
    const deadline = Date.now() + timeoutMs;
    while (queue.length === 0) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("tempo esgotado esperando evento SSE");
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), remaining);
      });
      const result = await Promise.race([reader.read(), timeout]);
      clearTimeout(timer);
      if (result === "timeout") throw new Error("tempo esgotado esperando evento SSE");
      if (result.done) return null;
      buffer += decoder.decode(result.value, { stream: true });
      let separator = buffer.indexOf("\n\n");
      while (separator !== -1) {
        queue.push(parse(buffer.slice(0, separator)));
        buffer = buffer.slice(separator + 2);
        separator = buffer.indexOf("\n\n");
      }
    }
    return queue.shift() ?? null;
  }

  /** Próximo evento com nome, pulando heartbeats. */
  async function nextEvent(timeoutMs = 3000): Promise<{ id?: string; event: string; data: unknown }> {
    for (;;) {
      const frame = await next(timeoutMs);
      if (!frame) throw new Error("stream encerrado");
      if (frame.event) return { ...(frame.id === undefined ? {} : { id: frame.id }), event: frame.event, data: JSON.parse(frame.data ?? "null") };
    }
  }

  return { next, nextEvent };
}

describe("tempo real (SSE)", () => {
  let client: PrismaClient;
  let server: Server;
  let url: string;
  let bus: EventBus;
  let fanout: Fanout;
  let anaId: string;
  let otherId: string;
  let brunoId: string;
  let ana: string;
  let other: string;
  let bruno: string;
  let rafael: string;
  const controllers: AbortController[] = [];
  let agentDraft: ProposedTicketDraft | null = null;

  const cookieOf = async (userId: string, now = new Date()) => `nexo_session=${await issueSessionToken({ userId, secret: SECRET, now })}`;

  async function open(path: string, cookie: string | undefined, headers: Record<string, string> = {}) {
    const controller = new AbortController();
    controllers.push(controller);
    const res = await fetch(`${url}${path}`, { headers: { ...(cookie ? { Cookie: cookie } : {}), ...headers }, signal: controller.signal });
    return { res, controller, ...(res.headers.get("content-type")?.startsWith("text/event-stream") ? sseReader(res) : { next: null, nextEvent: null }) };
  }

  /** Abre o stream e consome o `retry` e o `sync` iniciais. */
  async function stream(path: string, cookie: string, headers: Record<string, string> = {}) {
    const opened = await open(path, cookie, headers);
    assert.equal(opened.res.status, 200);
    const { next, nextEvent } = opened;
    assert.ok(next && nextEvent);
    assert.deepEqual(await next(), { retry: "3000" });
    const sync = await nextEvent();
    assert.equal(sync.event, "sync");
    return { ...opened, next, nextEvent, sync };
  }

  function post(path: string, cookie: string, body?: unknown): Promise<Response> {
    return fetch(`${url}${path}`, {
      method: "POST",
      headers: { Cookie: cookie, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  function createConversation(ownerId: string, status: ConversationStatus = "WAITING_ANALYST") {
    const handoff = status === "WITH_AGENT" ? {} : { handoffReason: "EMPLOYEE_REQUEST" as const, handoffSummary: "s", handoffAt: T0 };
    return client.conversation.create({ data: { ownerId, status, messageCount: 1, lastMessageAt: T0, ...handoff } });
  }

  async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
      if (Date.now() > deadline) throw new Error("condição não atingida");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  before(async () => {
    client = await createTestDatabase();
    anaId = (await client.user.create({ data: { name: "Ana Souza", email: "ana@teste.example", role: "EMPLOYEE" } })).id;
    otherId = (await client.user.create({ data: { name: "Marina Costa", email: "marina@teste.example", role: "EMPLOYEE" } })).id;
    brunoId = (await client.user.create({ data: { name: "Bruno Martins", email: "bruno@teste.example", role: "ANALYST" } })).id;
    const rafaelId = (await client.user.create({ data: { name: "Rafael Lima", email: "rafael@teste.example", role: "ANALYST" } })).id;
    [ana, other, bruno, rafael] = await Promise.all([cookieOf(anaId), cookieOf(otherId), cookieOf(brunoId), cookieOf(rafaelId)]);

    bus = createEventBus();
    const queries = createConversationQueries(client);
    fanout = createFanout({ bus, readConversation: (id) => queries.find(id) });
    const conversations = createConversationService(client, { publisher: fanout });
    const tickets = createTicketService(client);
    const agentRunner: AgentRunner = {
      runTurn: () => Promise.resolve({ content: "Preparei o chamado.", trace: TRACE, ticketLookup: null, ticketDraft: agentDraft }),
    };
    const chatService = createChatService({ conversations, queries, agentRunner, tickets });
    const consoleService = createConsoleService({ conversations, queries, tickets });
    server = createApp({
      config,
      authService: createAuthService(client),
      chatService,
      consoleService,
      eventBus: bus,
      streamOptions: { heartbeatMs: 60_000, maxStreamsPerUser: 5 },
    }).listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(async () => {
    for (const controller of controllers.splice(0)) controller.abort();
    await waitFor(() => bus.subscriberCount() === 0);
    await fanout.idle();
    await client.ticketEvent.deleteMany();
    await client.ticket.deleteMany();
    await client.conversation.deleteMany();
    await client.ticketCounter.deleteMany();
    await client.ticketCounter.createMany({ data: [{ type: "INC", lastNumber: 100 }, { type: "REQ", lastNumber: 200 }] });
    agentDraft = null;
  });

  after(async () => {
    for (const controller of controllers.splice(0)) controller.abort();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await client.$disconnect();
  });

  describe("abertura", () => {
    it("sem cookie responde 401 em JSON, e papel errado responde 403", async () => {
      for (const [path, wrong] of [["/chat/events", () => bruno], ["/console/events", () => ana]] as const) {
        const anonymous = await open(path, undefined);
        assert.equal(anonymous.res.status, 401);
        assert.equal(((await anonymous.res.json()) as { error: { code: string } }).error.code, "SESSION_MISSING");
        const forbidden = await open(path, wrong());
        assert.equal(forbidden.res.status, 403);
        assert.equal(((await forbidden.res.json()) as { error: { code: string } }).error.code, "FORBIDDEN");
      }
      assert.equal(bus.subscriberCount(), 0);
    });

    it("manda os cabeçalhos de stream, o retry e, primeiro, sync RESYNC com a cabeça do barramento", async () => {
      const { res, sync } = await stream("/console/events", bruno);
      assert.match(res.headers.get("content-type") ?? "", /^text\/event-stream; charset=utf-8$/);
      assert.equal(res.headers.get("cache-control"), "no-cache, no-transform");
      assert.equal(res.headers.get("x-accel-buffering"), "no");
      assert.deepEqual(sync.data, { mode: "RESYNC" });
      assert.equal(sync.id, bus.head());
    });

    it("manda heartbeat como comentário, sem id", async () => {
      const app = createApp({
        config,
        authService: createAuthService(client),
        chatService: createChatService({
          conversations: createConversationService(client),
          queries: createConversationQueries(client),
          agentRunner: { runTurn: () => Promise.reject(new Error("não usado")) },
          tickets: createTicketService(client),
        }),
        consoleService: createConsoleService({
          conversations: createConversationService(client),
          queries: createConversationQueries(client),
          tickets: createTicketService(client),
        }),
        eventBus: createEventBus(),
        streamOptions: { heartbeatMs: 50 },
      });
      const fast = app.listen(0);
      await new Promise((resolve) => fast.once("listening", resolve));
      const controller = new AbortController();
      try {
        const res = await fetch(`http://127.0.0.1:${(fast.address() as AddressInfo).port}/chat/events`, { headers: { Cookie: ana }, signal: controller.signal });
        const { next } = sseReader(res);
        await next();
        await next();
        assert.deepEqual(await next(500), { comment: "ping" });
        assert.deepEqual(await next(500), { comment: "ping" });
      } finally {
        controller.abort();
        fast.closeAllConnections();
        await new Promise((resolve) => fast.close(resolve));
      }
    });

    it("fechar o cliente desinscreve do barramento", async () => {
      const first = await stream("/chat/events", ana);
      await stream("/console/events", bruno);
      assert.equal(bus.subscriberCount(), 2);
      first.controller.abort();
      await waitFor(() => bus.subscriberCount() === 1);
    });

    it("o sexto stream do mesmo usuário recebe 429, e fechar um libera a vaga", async () => {
      const opened = [];
      for (let i = 0; i < 5; i++) opened.push(await stream("/console/events", bruno));
      const sixth = await open("/console/events", bruno);
      assert.equal(sixth.res.status, 429);
      assert.equal(((await sixth.res.json()) as { error: { code: string } }).error.code, "TOO_MANY_STREAMS");
      assert.equal((await stream("/console/events", rafael)).res.status, 200);
      opened[0]?.controller.abort();
      await waitFor(() => bus.subscriberCount() === 5);
      assert.equal((await stream("/console/events", bruno)).res.status, 200);
    });

    it("cliente que desiste enquanto a sessão é verificada não vaza assinante nem vaga", async () => {
      const auth = createAuthService(client);
      const slowBus = createEventBus();
      const slow = createApp({
        config,
        authService: { ...auth, findSessionUser: async (id) => (await new Promise((resolve) => setTimeout(resolve, 200)), auth.findSessionUser(id)) },
        chatService: createChatService({
          conversations: createConversationService(client),
          queries: createConversationQueries(client),
          agentRunner: { runTurn: () => Promise.reject(new Error("não usado")) },
          tickets: createTicketService(client),
        }),
        consoleService: createConsoleService({
          conversations: createConversationService(client),
          queries: createConversationQueries(client),
          tickets: createTicketService(client),
        }),
        eventBus: slowBus,
      }).listen(0);
      await new Promise((resolve) => slow.once("listening", resolve));
      const base = `http://127.0.0.1:${(slow.address() as AddressInfo).port}`;
      try {
        for (let i = 0; i < 5; i++) {
          const controller = new AbortController();
          setTimeout(() => controller.abort(), 30);
          await fetch(`${base}/console/events`, { headers: { Cookie: bruno }, signal: controller.signal }).catch(() => undefined);
        }
        await new Promise((resolve) => setTimeout(resolve, 400));
        assert.equal(slowBus.subscriberCount(), 0);
        const controller = new AbortController();
        const res = await fetch(`${base}/console/events`, { headers: { Cookie: bruno }, signal: controller.signal });
        assert.equal(res.status, 200);
        controller.abort();
      } finally {
        slow.closeAllConnections();
        await new Promise((resolve) => slow.close(resolve));
      }
    });

    it("cliente que não lê é derrubado quando o buffer passa do limite, sem fila própria", async () => {
      const { res } = await open("/console/events", bruno);
      assert.equal(res.status, 200);
      assert.equal(bus.subscriberCount(), 1);
      const content = "x".repeat(64 * 1024);
      const at = new Date();
      for (let i = 0; i < 400 && bus.subscriberCount() > 0; i++) {
        bus.push({
          type: "message.created",
          ownerId: anaId,
          conversationId: "c",
          data: { id: `m${i}`, conversationId: "c", authorType: "SYSTEM", author: null, content, createdAt: at, trace: null },
        });
        await new Promise((resolve) => setImmediate(resolve));
      }
      assert.equal(bus.subscriberCount(), 0);
    });

    it("com a sessão expirando, manda session.expired e encerra o stream", async () => {
      const expiring = await cookieOf(anaId, new Date(Date.now() - SESSION_TTL_SECONDS * 1000 + 1000));
      const { next, nextEvent } = await stream("/chat/events", expiring);
      const expired = await nextEvent(3000);
      assert.deepEqual([expired.event, expired.data, expired.id], ["session.expired", {}, undefined]);
      assert.equal(await next(1000), null);
      await waitFor(() => bus.subscriberCount() === 0);
    });
  });

  describe("público e autorização por evento", () => {
    it("o funcionário só recebe eventos das próprias conversas, e nunca tickets.changed", async () => {
      const mine = await createConversation(anaId);
      const theirs = await createConversation(otherId);
      const { nextEvent } = await stream("/chat/events", ana);
      assert.equal((await post(`/console/conversations/${theirs.id}/takeover`, bruno)).status, 200);
      assert.equal((await post(`/console/conversations/${mine.id}/takeover`, bruno)).status, 200);
      const created = await nextEvent();
      assert.equal(created.event, "message.created");
      assert.deepEqual(created.data, {
        conversationId: mine.id,
        message: {
          id: (created.data as { message: { id: string } }).message.id,
          authorType: "SYSTEM",
          author: null,
          content: "Bruno assumiu a conversa",
          createdAt: (created.data as { message: { createdAt: string } }).message.createdAt,
          trace: null,
        },
      });
      const updated = await nextEvent();
      assert.equal(updated.event, "conversation.updated");
      assert.deepEqual(updated.data, {
        conversation: { id: mine.id, status: "WITH_ANALYST", messageCount: 1, messageLimit: 30, remainingMessages: 29, analyst: { id: brunoId, name: "Bruno Martins" } },
      });
    });

    it("dois analistas recebem assignedToMe diferente no mesmo evento", async () => {
      const { id } = await createConversation(anaId);
      const asBruno = await stream("/console/events", bruno);
      const asRafael = await stream("/console/events", rafael);
      await post(`/console/conversations/${id}/takeover`, bruno);
      for (const [reader, expected] of [[asBruno, true], [asRafael, false]] as const) {
        assert.equal((await reader.nextEvent()).event, "message.created");
        const updated = await reader.nextEvent();
        assert.equal(updated.event, "conversation.updated");
        const { conversation } = updated.data as { conversation: { id: string; assignedToMe: boolean; status: string; analyst: unknown } };
        assert.deepEqual([conversation.id, conversation.status, conversation.assignedToMe], [id, "WITH_ANALYST", expected]);
        assert.deepEqual(conversation.analyst, { id: brunoId, name: "Bruno Martins" });
      }
    });
  });

  describe("reconexão", () => {
    it("com Last-Event-ID dá REPLAY e só os eventos perdidos, já filtrados", async () => {
      const mine = await createConversation(anaId);
      const theirs = await createConversation(otherId);
      const first = await stream("/chat/events", ana);
      first.controller.abort();
      await waitFor(() => bus.subscriberCount() === 0);
      await post(`/console/conversations/${theirs.id}/takeover`, bruno);
      await post(`/console/conversations/${mine.id}/takeover`, bruno);
      await fanout.idle();

      const lastEventId = first.sync.id ?? "";
      const replayed = await stream("/chat/events", ana, { "Last-Event-ID": lastEventId });
      assert.deepEqual(replayed.sync.data, { mode: "REPLAY" });
      // O sync do REPLAY repete o id do cliente: se o stream cair antes dos reenviados, eles voltam no próximo replay.
      assert.equal(replayed.sync.id, lastEventId);
      const created = await replayed.nextEvent();
      assert.equal(created.event, "message.created");
      assert.equal((created.data as { conversationId: string }).conversationId, mine.id);
      const updated = await replayed.nextEvent();
      assert.equal(updated.event, "conversation.updated");
      assert.equal(updated.id, bus.head());
      await assert.rejects(replayed.nextEvent(300), /tempo esgotado/);
    });

    it("o lastEventId também vale pela query, e um id desconhecido dá RESYNC", async () => {
      assert.deepEqual((await stream(`/console/events?lastEventId=${encodeURIComponent(bus.head())}`, bruno)).sync.data, { mode: "REPLAY" });
      for (const id of ["zzz.1", "lixo"]) {
        const resync = await stream("/console/events", bruno, { "Last-Event-ID": id });
        assert.deepEqual(resync.sync, { id: bus.head(), event: "sync", data: { mode: "RESYNC" } });
      }
    });
  });

  describe("ponta a ponta", () => {
    it("assumir, responder e a mensagem do funcionário chegam aos dois lados", async () => {
      const { id } = await createConversation(anaId);
      const employee = await stream("/chat/events", ana);
      const analyst = await stream("/console/events", bruno);

      await post(`/console/conversations/${id}/takeover`, bruno);
      for (const reader of [employee, analyst]) {
        const created = await reader.nextEvent();
        assert.equal((created.data as { message: { content: string } }).message.content, "Bruno assumiu a conversa");
        const updated = await reader.nextEvent();
        assert.equal((updated.data as { conversation: { status: string } }).conversation.status, "WITH_ANALYST");
      }

      await post(`/console/conversations/${id}/messages`, bruno, { content: "Oi, Ana!" });
      const reply = await employee.nextEvent();
      assert.deepEqual(
        [reply.event, (reply.data as { message: { authorType: string; content: string; author: unknown } }).message.authorType],
        ["message.created", "ANALYST"],
      );
      assert.deepEqual((reply.data as { message: { author: unknown } }).message.author, { id: brunoId, name: "Bruno Martins" });
      await employee.nextEvent();
      await analyst.nextEvent();
      await analyst.nextEvent();

      const sent = await post("/chat", ana, { conversationId: id, message: "Obrigada!" });
      const body = (await sent.json()) as ChatResponse;
      const received = await analyst.nextEvent();
      assert.equal(received.event, "message.created");
      const message = (received.data as { message: { id: string; authorType: string; content: string } }).message;
      assert.deepEqual([message.id, message.authorType, message.content], [body.employeeMessage.id, "EMPLOYEE", "Obrigada!"]);
      // O funcionário também recebe a própria mensagem, com o mesmo id do envelope: o cliente deduplica.
      assert.equal(((await employee.nextEvent()).data as { message: { id: string } }).message.id, body.employeeMessage.id);
    });

    it("confirmação CRITICAL: os analistas recebem a SYSTEM da transferência e tickets.changed", async () => {
      agentDraft = CRITICAL_DRAFT;
      const turn = (await (await post("/chat", ana, { message: "O ponto caiu na filial." })).json()) as ChatResponse;
      assert.ok(turn.ticketDraft);
      await fanout.idle();
      const analyst = await stream("/console/events", bruno);
      const confirm = await post(`/chat/drafts/${turn.ticketDraft.id}/confirm`, ana, {
        kind: "CREATE",
        title: "Ponto fora do ar",
        description: "Ninguém bate o ponto.",
        affectedScope: "COMPANY",
      });
      assert.equal(confirm.status, 200);
      const events = [];
      for (let i = 0; i < 4; i++) events.push(await analyst.nextEvent());
      assert.deepEqual(
        events.map((event) => [event.event, (event.data as { message?: { authorType: string } }).message?.authorType ?? null]),
        [
          ["message.created", "AGENT"],
          ["message.created", "SYSTEM"],
          ["conversation.updated", null],
          ["tickets.changed", null],
        ],
      );
      assert.deepEqual(events[3]?.data, { conversationId: turn.conversation.id, ownerId: anaId });
      const { conversation } = events[2]?.data as { conversation: { status: string; ticketCode: string } };
      assert.deepEqual([conversation.status, conversation.ticketCode], ["WAITING_ANALYST", "INC-101"]);
    });
  });
});
