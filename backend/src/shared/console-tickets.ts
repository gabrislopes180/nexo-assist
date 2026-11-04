import { z } from "zod";
import { TicketStatus, type ActorType, type AffectedScope, type TicketEventType, type TicketPriority } from "../generated/prisma/enums.js";
import type { Person } from "./chat.js";
import type { ConsoleTicket } from "./console.js";
import { boundedText } from "./conversation-draft.js";

/** Destinos que o analista escolhe no console; WAITING_ANALYST só volta pelo sistema ou pela reabertura. */
export const ANALYST_TARGET_STATUSES = ["IN_PROGRESS", "WAITING_EMPLOYEE", "APPROVED", "RESOLVED"] as const satisfies readonly TicketStatus[];

/**
 * `expectedStatus` é o status que o analista viu na tela: protege contra duplo clique e contra
 * outro analista ter mudado antes. A obrigatoriedade da nota é do serviço (requiresStatusNote).
 */
export const changeTicketStatusSchema = z.strictObject({
  toStatus: z.enum(ANALYST_TARGET_STATUSES),
  expectedStatus: z.enum(TicketStatus),
  note: boundedText(1000).optional(),
  conversationId: z.string().min(1).max(64).optional(),
});

export type ChangeTicketStatusRequest = z.infer<typeof changeTicketStatusSchema>;

/** Código de chamado na URL; fora do formato é tratado como inexistente (404). */
export const TICKET_CODE_PATTERN = /^(INC|REQ)-\d{1,10}$/i;

export type ConsoleTicketEvent = {
  id: string;
  type: TicketEventType;
  actorType: ActorType;
  /** Null para AGENT e SYSTEM. */
  actor: Person | null;
  /** Nota interna (STATUS_CHANGED), comentário (COMMENT) ou motivo (REOPENED). Só analistas veem. */
  content: string | null;
  fromStatus: TicketStatus | null;
  toStatus: TicketStatus | null;
  fromPriority: TicketPriority | null;
  toPriority: TicketPriority | null;
  /** Novo prazo definido por este evento. */
  dueAt: string | null;
  conversationId: string | null;
  createdAt: string;
};

export type ConsoleTicketDetail = ConsoleTicket & {
  description: string;
  affectedScope: AffectedScope;
  affectedDescription: string | null;
  owner: Person & { department: string | null };
  updatedAt: string;
  slaStartedAt: string | null;
  /** status === WAITING_EMPLOYEE: prazo pausado (dueAt null). */
  slaPaused: boolean;
  /** Transições que o analista pode fazer agora; o frontend não reimplementa a regra. */
  allowedStatuses: TicketStatus[];
  /** Destinos que exigem `note`. */
  statusNoteRequired: TicketStatus[];
  /** Ordem cronológica; no máximo os 200 mais recentes. */
  events: ConsoleTicketEvent[];
};

export type ChangeTicketStatusResponse = { ticket: ConsoleTicketDetail; changed: boolean };
