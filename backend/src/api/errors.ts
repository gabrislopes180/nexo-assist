import type { ErrorRequestHandler, RequestHandler, Response } from "express";
import { EmailNotFoundError } from "../auth/auth-service.js";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

/** Erros do body parser (JSON malformado, body grande) trazem `status` 4xx. */
function clientErrorStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("status" in error)) return null;
  const { status } = error;
  return typeof status === "number" && status >= 400 && status < 500 ? status : null;
}

export const notFoundHandler: RequestHandler = () => {
  throw new ApiError(404, "NOT_FOUND", "Rota não encontrada.");
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error instanceof ApiError) {
    sendError(res, error.status, error.code, error.message);
    return;
  }
  if (error instanceof EmailNotFoundError) {
    sendError(res, 401, "EMAIL_NOT_FOUND", "E-mail não encontrado.");
    return;
  }
  const status = clientErrorStatus(error);
  if (status !== null) {
    sendError(res, status, "INVALID_REQUEST", "Requisição inválida.");
    return;
  }
  // Só a stack: o objeto do erro pode carregar o body da requisição em campos anexados.
  console.error("Erro inesperado na API:", error instanceof Error ? error.stack : "erro sem detalhes");
  sendError(res, 500, "INTERNAL_ERROR", "Erro interno.");
};
