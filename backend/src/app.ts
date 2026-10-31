import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import { createAuthRouter } from "./api/auth-routes.js";
import type { AppDeps } from "./api/deps.js";
import { errorHandler, notFoundHandler } from "./api/errors.js";

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

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
