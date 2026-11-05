import type { Request, Response } from "express";
import { EmployeeOnlyError } from "../chat/chat-service.js";
import { AnalystOnlyError } from "../console/console-service.js";
import { describeErrorForLog } from "../shared/safe-error.js";
import type { SessionUser } from "../shared/session.js";
import { REALTIME_DEFAULTS, type StreamOptions } from "./config.js";
import type { EventBus } from "./event-bus.js";
import { canReceive, serializeFor } from "./serializers.js";

/** Acima do limite de streams abertos pelo mesmo usuário; sai em JSON, antes dos cabeçalhos do stream. */
export class TooManyStreamsError extends Error {
  constructor() {
    super("Streams demais abertos pelo mesmo usuário");
    this.name = "TooManyStreamsError";
  }
}

export type StreamAudience = "EMPLOYEE" | "ANALYST";

export type EventStreams = {
  /** Lança antes de escrever qualquer coisa (papel errado, limite); depois disso, o stream fica aberto até fechar. */
  open(req: Request, res: Response, session: { user: SessionUser; expiresAt: Date; audience: StreamAudience }): void;
};

function lastEventIdOf(req: Request): string | null {
  const header = req.get("last-event-id");
  if (header) return header;
  const { lastEventId } = req.query;
  return typeof lastEventId === "string" && lastEventId !== "" ? lastEventId : null;
}

function frame({ id, event, data }: { id?: string; event: string; data: unknown }): string {
  return `${id === undefined ? "" : `id: ${id}\n`}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Um stream por papel: o funcionário recebe as próprias conversas, o analista recebe todas.
 * A inscrição e a leitura do buffer de replay acontecem no mesmo tick, sem `await` entre elas.
 * Sem fila própria por assinante: cliente lento demais é derrubado e reconecta com Last-Event-ID.
 */
export function createEventStreams({ bus, options = {} }: { bus: EventBus; options?: Partial<StreamOptions> }): EventStreams {
  const { heartbeatMs, retryMs, maxStreamsPerUser, maxBufferedBytes, now } = { ...REALTIME_DEFAULTS, now: () => new Date(), ...options };
  const openByUser = new Map<string, number>();

  return {
    open(req, res, { user, expiresAt, audience }) {
      if (user.role !== audience) throw audience === "EMPLOYEE" ? new EmployeeOnlyError() : new AnalystOnlyError();
      // O cliente pode ter desistido enquanto a sessão era verificada: o "close" já passou e não voltaria.
      if (req.destroyed || res.destroyed || req.socket.destroyed) return;
      const open = openByUser.get(user.id) ?? 0;
      if (open >= maxStreamsPerUser) throw new TooManyStreamsError();

      res.status(200).set({
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-store, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      let closed = false;
      let heartbeat: NodeJS.Timeout | undefined;
      let expiry: NodeJS.Timeout | undefined;
      let unsubscribe: () => void = () => undefined;

      function cleanup(): void {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(heartbeat);
        clearTimeout(expiry);
        const remaining = (openByUser.get(user.id) ?? 1) - 1;
        if (remaining > 0) openByUser.set(user.id, remaining);
        else openByUser.delete(user.id);
      }

      function write(chunk: string): void {
        if (closed) return;
        if (res.destroyed || res.writableEnded) {
          cleanup();
          return;
        }
        try {
          const flushed = res.write(chunk);
          if (!flushed && res.writableLength > maxBufferedBytes) {
            cleanup();
            res.destroy();
          }
        } catch (error) {
          console.error("Falha ao escrever no stream:", describeErrorForLog(error));
          cleanup();
          res.destroy();
        }
      }

      function end(): void {
        cleanup();
        res.end();
      }

      // O contador só sobe com o "close" já registrado: qualquer saída daqui em diante o devolve.
      openByUser.set(user.id, open + 1);
      res.on("close", cleanup);
      res.flushHeaders();
      req.socket.setTimeout(0);
      req.socket.setNoDelay(true);
      write(`retry: ${retryMs}\n\n`);
      if (closed) return;

      // Mesmo tick: nada publicado entre a leitura do buffer e a inscrição.
      const viewer = { id: user.id, role: user.role };
      const lastEventId = lastEventIdOf(req);
      const replay = bus.replaySince(lastEventId);
      unsubscribe = bus.subscribe({
        filter: (event) => canReceive(viewer, event),
        onEvent: (event) => {
          const serialized = serializeFor(viewer, event);
          if (serialized) write(frame(serialized));
        },
        onClose: end,
      });
      // No REPLAY, o sync repete o id do cliente: se o stream cair antes dos eventos reenviados, nada se perde.
      write(frame({ id: replay && lastEventId ? lastEventId : bus.head(), event: "sync", data: { mode: replay ? "REPLAY" : "RESYNC" } }));
      for (const event of replay ?? []) {
        const serialized = serializeFor(viewer, event);
        if (serialized) write(frame(serialized));
      }

      if (closed) return;
      heartbeat = setInterval(() => write(": ping\n\n"), heartbeatMs);
      expiry = setTimeout(
        () => {
          write(frame({ event: "session.expired", data: {} }));
          end();
        },
        Math.max(0, expiresAt.getTime() - now().getTime()),
      );
    },
  };
}
