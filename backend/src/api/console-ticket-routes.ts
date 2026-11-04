import { Router, type Request } from "express";
import { assertAnalyst } from "../console/console-service.js";
import { changeTicketStatusSchema } from "../shared/console-tickets.js";
import type { AppDeps } from "./deps.js";
import { invalidRequest } from "./request.js";
import { requireSession, sessionUserOf } from "./session.js";

function codeParamOf(req: Request): string {
  const { code } = req.params;
  return typeof code === "string" ? code : "";
}

/**
 * Chamados no console, centrados no chamado. Mesmo padrão do console: sessão, depois papel
 * (403 antes de qualquer 400), depois validação. O papel é checado de novo no serviço.
 */
export function createConsoleTicketRouter(deps: AppDeps): Router {
  const router = Router();
  const service = deps.consoleTicketService;

  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.use(requireSession(deps));
  router.use((_req, res, next) => {
    assertAnalyst(sessionUserOf(res));
    next();
  });

  router.get("/:code", async (req, res) => {
    res.json({ ticket: await service.getTicket(sessionUserOf(res), codeParamOf(req)) });
  });

  router.post("/:code/status", async (req, res) => {
    const parsed = changeTicketStatusSchema.safeParse(req.body);
    if (!parsed.success) throw invalidRequest();
    res.json(await service.changeStatus(sessionUserOf(res), codeParamOf(req), parsed.data));
  });

  return router;
}
