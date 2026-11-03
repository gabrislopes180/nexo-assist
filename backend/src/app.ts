import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import { createAuthRouter } from "./api/auth-routes.js";
import { createChatRouter } from "./api/chat-routes.js";
import { createConsoleRouter } from "./api/console-routes.js";
import type { AppDeps } from "./api/deps.js";
import { errorHandler, notFoundHandler } from "./api/errors.js";
import { createEventStreams } from "./realtime/sse.js";

export type { AppDeps };

export function createApp(deps: AppDeps): Express {
  const app = express();

  app.use(
    cors({
      origin: deps.config.corsOrigins,
      credentials: true,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type"],
    }),
  );
  app.use(express.json());
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/auth", createAuthRouter(deps));
  // Um contador de streams por usuário, compartilhado pelas duas rotas de eventos.
  const streams = createEventStreams({ bus: deps.eventBus, ...(deps.streamOptions ? { options: deps.streamOptions } : {}) });
  app.use("/chat", createChatRouter(deps, streams));
  app.use("/console", createConsoleRouter(deps, streams));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
