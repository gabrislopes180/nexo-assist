import type { Request } from "express";
import { ApiError } from "./errors.js";

/** Id ausente ou repetido nunca casa com uma conversa ou um rascunho: cai no mesmo 404. */
export function idParamOf(req: Request): string {
  const { id } = req.params;
  return typeof id === "string" ? id : "";
}

/** O 400 de corpo, query ou parâmetro fora do contrato, sem dizer qual campo falhou. */
export function invalidRequest(): ApiError {
  return new ApiError(400, "INVALID_REQUEST", "Requisição inválida.");
}
