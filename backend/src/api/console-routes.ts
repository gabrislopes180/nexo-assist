import { Router, type Request } from "express";
import { assertAnalyst } from "../console/console-service.js";
import { analystReplySchema, consoleListQuerySchema, emptyBodySchema } from "../shared/console.js";
import type { EventStreams } from "../realtime/sse.js";
import type { AppDeps } from "./deps.js";
import { ApiError } from "./errors.js";
import { requireSession, sessionExpiresAtOf, sessionUserOf } from "./session.js";

/** Id ausente ou repetido nunca casa com uma conversa: cai no mesmo 404. */
function conversationIdOf(req: Request): string {
  const { id } = req.params;
  return typeof id === "string" ? id : "";
}

function invalidRequest(): ApiError {
  return new ApiError(400, "INVALID_REQUEST", "Requisição inválida.");
}

function assertEmptyBody(req: Request): void {
  if (!emptyBodySchema.safeParse(req.body).success) throw invalidRequest();
}

/**
 * O papel é checado no ConsoleService; o router repete a mesma checagem logo após a sessão,
 * antes de qualquer validação, para que quem não é analista receba 403 e nunca 400.
 */
export function createConsoleRouter(deps: AppDeps, streams: EventStreams): Router {
  const router = Router();
  const service = deps.consoleService;

  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.use(requireSession(deps));
  router.use((_req, res, next) => {
    assertAnalyst(sessionUserOf(res));
    next();
  });

  /** SSE com os eventos de todas as conversas, para o analista. */
  router.get("/events", (req, res) => {
    streams.open(req, res, { user: sessionUserOf(res), expiresAt: sessionExpiresAtOf(res), audience: "ANALYST" });
  });

  router.get("/conversations", async (req, res) => {
    const parsed = consoleListQuerySchema.safeParse(req.query);
    if (!parsed.success) throw invalidRequest();
    res.json({ conversations: await service.listConversations(sessionUserOf(res), parsed.data) });
  });

  router.get("/conversations/:id", async (req, res) => {
    res.json({ conversation: await service.getConversation(sessionUserOf(res), conversationIdOf(req)) });
  });

  router.get("/conversations/:id/messages", async (req, res) => {
    res.json({ messages: await service.getMessages(sessionUserOf(res), conversationIdOf(req)) });
  });

  router.get("/conversations/:id/tickets", async (req, res) => {
    res.json(await service.getTickets(sessionUserOf(res), conversationIdOf(req)));
  });

  router.post("/conversations/:id/takeover", async (req, res) => {
    assertEmptyBody(req);
    res.json({ conversation: await service.takeOver(sessionUserOf(res), conversationIdOf(req)) });
  });

  router.post("/conversations/:id/messages", async (req, res) => {
    const parsed = analystReplySchema.safeParse(req.body);
    if (!parsed.success) throw invalidRequest();
    res.json(await service.reply(sessionUserOf(res), conversationIdOf(req), parsed.data.content));
  });

  router.post("/conversations/:id/return", async (req, res) => {
    assertEmptyBody(req);
    res.json({ conversation: await service.returnToAgent(sessionUserOf(res), conversationIdOf(req)) });
  });

  router.post("/conversations/:id/close", async (req, res) => {
    assertEmptyBody(req);
    res.json({ conversation: await service.close(sessionUserOf(res), conversationIdOf(req)) });
  });

  return router;
}
