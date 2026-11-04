import type { ErrorRequestHandler, RequestHandler, Response } from "express";
import { EmailNotFoundError } from "../auth/auth-service.js";
import { AgentUnavailableError } from "../chat/agent-runner.js";
import { EmployeeOnlyError } from "../chat/chat-service.js";
import { AnalystOnlyError } from "../console/console-service.js";
import { ConversationNotAssignedError, ConversationNotWaitingError } from "../conversations/attendance.js";
import {
  ConversationClosedError,
  ConversationMessageLimitReachedError,
  ConversationNotFoundError,
  ConversationNotWithAgentError,
} from "../conversations/conversation-service.js";
import { CONVERSATION_MESSAGE_LIMIT } from "../conversations/conversation-rules.js";
import { ArticleNotFoundError, KnowledgeUnavailableError } from "../knowledge/knowledge-service.js";
import { TooManyStreamsError } from "../realtime/sse.js";
import { DraftKindMismatchError, DraftNotFoundError, TicketNotOpenError, TicketNotReopenableError } from "../conversations/ticket-draft.js";
import { describeErrorForLog } from "../shared/safe-error.js";
import { TicketServiceUnavailableError } from "../tickets/ticket-service.js";
import {
  InvalidTicketConversationError,
  TicketNotFoundError,
  TicketStatusConflictError,
  TicketStatusNoteRequiredError,
  TicketTransitionNotAllowedError,
} from "../tickets/ticket-status-service.js";

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

/** Erros de domínio com resposta fixa: nada do erro original chega ao cliente. */
const DOMAIN_ERRORS = [
  { type: EmailNotFoundError, status: 401, code: "EMAIL_NOT_FOUND", message: "E-mail não encontrado." },
  { type: EmployeeOnlyError, status: 403, code: "FORBIDDEN", message: "Acesso não permitido." },
  { type: AnalystOnlyError, status: 403, code: "FORBIDDEN", message: "Acesso não permitido." },
  {
    type: ConversationNotWaitingError,
    status: 409,
    code: "CONVERSATION_NOT_WAITING",
    message: "Esta conversa não está mais esperando atendente.",
  },
  {
    type: ConversationNotAssignedError,
    status: 409,
    code: "CONVERSATION_NOT_ASSIGNED",
    message: "Esta conversa não está sendo atendida por você.",
  },
  { type: ConversationNotFoundError, status: 404, code: "CONVERSATION_NOT_FOUND", message: "Conversa não encontrada." },
  {
    type: ConversationMessageLimitReachedError,
    status: 409,
    code: "CONVERSATION_MESSAGE_LIMIT_REACHED",
    message: `Esta conversa atingiu o limite de ${CONVERSATION_MESSAGE_LIMIT} mensagens.`,
  },
  { type: ConversationClosedError, status: 409, code: "CONVERSATION_CLOSED", message: "Esta conversa foi encerrada." },
  {
    type: ConversationNotWithAgentError,
    status: 409,
    code: "CONVERSATION_NOT_WITH_AGENT",
    message: "Esta conversa não está mais com o assistente.",
  },
  { type: DraftKindMismatchError, status: 400, code: "INVALID_REQUEST", message: "Requisição inválida." },
  { type: DraftNotFoundError, status: 404, code: "DRAFT_NOT_FOUND", message: "Rascunho não encontrado." },
  {
    type: TicketNotReopenableError,
    status: 409,
    code: "TICKET_NOT_REOPENABLE",
    message: "Este chamado não pode mais ser reaberto. Se o problema voltou, abra um chamado novo.",
  },
  { type: TicketNotOpenError, status: 409, code: "TICKET_NOT_OPEN", message: "Este chamado não está mais aberto." },
  { type: TicketNotFoundError, status: 404, code: "TICKET_NOT_FOUND", message: "Chamado não encontrado." },
  {
    type: TicketStatusConflictError,
    status: 409,
    code: "TICKET_STATUS_CONFLICT",
    message: "O status deste chamado mudou. Atualize e tente de novo.",
  },
  {
    type: TicketTransitionNotAllowedError,
    status: 409,
    code: "TICKET_TRANSITION_NOT_ALLOWED",
    message: "Essa mudança de status não é permitida para este chamado.",
  },
  { type: TicketStatusNoteRequiredError, status: 400, code: "INVALID_REQUEST", message: "Requisição inválida." },
  { type: InvalidTicketConversationError, status: 400, code: "INVALID_REQUEST", message: "Requisição inválida." },
  {
    type: TicketServiceUnavailableError,
    status: 503,
    code: "TICKET_SERVICE_UNAVAILABLE",
    message: "O serviço de chamados está indisponível no momento. Tente novamente em instantes.",
  },
  { type: ArticleNotFoundError, status: 404, code: "ARTICLE_NOT_FOUND", message: "Artigo não encontrado." },
  {
    type: KnowledgeUnavailableError,
    status: 503,
    code: "HELP_CENTER_UNAVAILABLE",
    message: "A central de ajuda está indisponível no momento. Tente novamente em instantes.",
  },
  { type: TooManyStreamsError, status: 429, code: "TOO_MANY_STREAMS", message: "Muitas conexões abertas. Feche outras abas e tente de novo." },
  {
    type: AgentUnavailableError,
    status: 503,
    code: "AGENT_UNAVAILABLE",
    message: "O assistente está indisponível no momento. Tente novamente em instantes.",
  },
] as const;

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
  const domainError = DOMAIN_ERRORS.find(({ type }) => error instanceof type);
  if (domainError) {
    sendError(res, domainError.status, domainError.code, domainError.message);
    return;
  }
  const status = clientErrorStatus(error);
  if (status !== null) {
    sendError(res, status, "INVALID_REQUEST", "Requisição inválida.");
    return;
  }
  console.error("Erro inesperado na API:", describeErrorForLog(error));
  sendError(res, 500, "INTERNAL_ERROR", "Erro interno.");
};
