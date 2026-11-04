import { Router } from "express";
import type { AppDeps } from "./deps.js";
import { requireSession } from "./session.js";

/**
 * Central de ajuda: leitura de artigo para qualquer papel autenticado (o card do chat abre o
 * texto completo). Slug fora do formato cai no mesmo 404 do inexistente, decidido no serviço.
 * Sem rota de busca na v1: a busca é só pela tool do agent.
 */
export function createHelpRouter(deps: AppDeps): Router {
  const router = Router();

  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.use(requireSession(deps));

  router.get("/articles/:slug", async (req, res) => {
    const { slug } = req.params;
    res.json({ article: await deps.knowledgeService.getArticle(typeof slug === "string" ? slug : "") });
  });

  return router;
}
