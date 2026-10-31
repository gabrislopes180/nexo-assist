import { Router } from "express";
import { issueSessionToken } from "../auth/session-token.js";
import { loginRequestSchema } from "../shared/session.js";
import type { AppDeps } from "./deps.js";
import { ApiError } from "./errors.js";
import { clearSessionCookie, requireSession, sessionUserOf, setSessionCookie } from "./session.js";

export function createAuthRouter(deps: AppDeps): Router {
  const router = Router();

  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  router.post("/login", async (req, res) => {
    const parsed = loginRequestSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "INVALID_REQUEST", "Requisição inválida.");

    const user = await deps.authService.login(parsed.data.email);
    const token = await issueSessionToken({ userId: user.id, secret: deps.config.sessionSecret, now: new Date() });
    setSessionCookie(res, token, deps.config);
    res.json({ user });
  });

  router.get("/me", requireSession(deps), (_req, res) => {
    res.json({ user: sessionUserOf(res) });
  });

  // Sem requireSession: é idempotente e funciona com sessão inválida ou ausente.
  router.post("/logout", (_req, res) => {
    clearSessionCookie(res, deps.config);
    res.status(204).end();
  });

  return router;
}
