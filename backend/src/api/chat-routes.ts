import { Router } from "express";
import { chatRequestSchema } from "../shared/chat.js";
import type { AppDeps } from "./deps.js";
import { ApiError } from "./errors.js";
import { requireSession, sessionUserOf } from "./session.js";

export function createChatRouter(deps: AppDeps): Router {
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

  return router;
}
