import { Router, type Request } from "express";
import { cancelDraftRequestSchema, chatRequestSchema, confirmDraftRequestSchema } from "../shared/chat.js";
import type { EventStreams } from "../realtime/sse.js";
import type { AppDeps } from "./deps.js";
import { ApiError } from "./errors.js";
import { requireSession, sessionExpiresAtOf, sessionUserOf } from "./session.js";

/** Id ausente ou repetido nunca casa com um rascunho ou conversa: cai no mesmo 404. */
function idParamOf(req: Request): string {
  const { id } = req.params;
  return typeof id === "string" ? id : "";
}

export function createChatRouter(deps: AppDeps, streams: EventStreams): Router {
  const router = Router();

  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  router.post("/", requireSession(deps), async (req, res) => {
    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "INVALID_REQUEST", "Requisição inválida.");

    res.json(await deps.chatService.sendMessage(sessionUserOf(res), parsed.data));
  });

  /** SSE com os eventos das conversas do funcionário da sessão. */
  router.get("/events", requireSession(deps), (req, res) => {
    streams.open(req, res, { user: sessionUserOf(res), expiresAt: sessionExpiresAtOf(res), audience: "EMPLOYEE" });
  });

  router.get("/conversations/:id", requireSession(deps), async (req, res) => {
    res.json(await deps.chatService.getConversation(sessionUserOf(res), idParamOf(req)));
  });

  router.post("/drafts/:id/confirm", requireSession(deps), async (req, res) => {
    const parsed = confirmDraftRequestSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "INVALID_REQUEST", "Requisição inválida.");

    res.json(await deps.chatService.confirmDraft(sessionUserOf(res), idParamOf(req), parsed.data));
  });

  router.post("/drafts/:id/cancel", requireSession(deps), async (req, res) => {
    if (!cancelDraftRequestSchema.safeParse(req.body).success) throw new ApiError(400, "INVALID_REQUEST", "Requisição inválida.");

    res.json(await deps.chatService.cancelDraft(sessionUserOf(res), idParamOf(req)));
  });

  return router;
}
