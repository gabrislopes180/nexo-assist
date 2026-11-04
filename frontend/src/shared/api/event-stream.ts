/**
 * Ciclo de vida de um EventSource, sem React e sem regra de negócio.
 *
 * - `live` só depois do `sync` do servidor; antes disso, `connecting`.
 * - Erro com o navegador reconectando sozinho (CONNECTING): `reconnecting`; no
 *   terceiro seguido, `down` (o consumidor liga o polling de reserva).
 * - Erro com o stream fechado (CLOSED): 401, 403, 429 e 5xx chegam iguais, pois o
 *   EventSource não mostra o status. Fica `down`, avisa o consumidor e reabre à
 *   mão com backoff (5, 10, 20, 40 s, teto de 60 s, jitter de até 20%), nunca na
 *   hora. Reabre com `?lastEventId=` para o servidor tentar o REPLAY.
 * - `lastEventId` inicial: o consumidor que fechou e reabre (rota escondida e
 *   mostrada de novo) continua do último evento, sem RESYNC.
 */
export type StreamStatus = "connecting" | "live" | "reconnecting" | "down";

export interface EventSourceLike {
  readyState: number;
  close(): void;
  addEventListener(
    type: string,
    cb: (event: MessageEvent<string>) => void,
  ): void;
}

export interface OpenEventStreamOptions {
  url: string;
  /** Recebe o JSON já parseado; quem consome valida com Zod. */
  events: Record<string, (data: unknown) => void>;
  onStatus: (status: StreamStatus) => void;
  /** O servidor fechou o stream: a sessão pode ter caído. */
  onClosedByServer: () => void;
  createSource?: (url: string) => EventSourceLike;
  random?: () => number;
  /** Avisa quando a rede volta; devolve a função que cancela. */
  subscribeOnline?: (cb: () => void) => () => void;
  /**
   * Último id já processado por um stream anterior do mesmo consumidor. A
   * primeira conexão já pede o REPLAY: sem buraco desde aquele evento.
   */
  lastEventId?: string | null;
  /** Cada id novo; quem reabrir depois passa o último em `lastEventId`. */
  onLastEventId?: (id: string) => void;
}

export interface EventStreamHandle {
  close(): void;
  reconnectNow(): void;
}

const CLOSED = 2;
const ERRORS_UNTIL_DOWN = 3;
const BACKOFF_START_MS = 5_000;
const BACKOFF_MAX_MS = 60_000;
const JITTER = 0.2;

function defaultCreateSource(url: string): EventSourceLike {
  return new EventSource(url);
}

function defaultSubscribeOnline(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("online", cb);
  return () => window.removeEventListener("online", cb);
}

function parse(raw: string): { ok: true; data: unknown } | { ok: false } {
  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

function withLastEventId(url: string, lastEventId: string | null): string {
  if (lastEventId === null) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}lastEventId=${encodeURIComponent(lastEventId)}`;
}

export function openEventStream({
  url,
  events,
  onStatus,
  onClosedByServer,
  createSource = defaultCreateSource,
  random = Math.random,
  subscribeOnline = defaultSubscribeOnline,
  lastEventId: initialLastEventId = null,
  onLastEventId,
}: OpenEventStreamOptions): EventStreamHandle {
  let source: EventSourceLike | null = null;
  let status: StreamStatus | null = null;
  let closed = false;
  let consecutiveErrors = 0;
  let backoffAttempt = 0;
  let lastEventId: string | null = initialLastEventId;
  let reopenTimer: ReturnType<typeof setTimeout> | null = null;

  const setStatus = (next: StreamStatus) => {
    if (closed || next === status) return;
    status = next;
    onStatus(next);
  };

  const clearReopen = () => {
    if (reopenTimer !== null) clearTimeout(reopenTimer);
    reopenTimer = null;
  };

  const dropSource = () => {
    source?.close();
    source = null;
  };

  const shutdown = () => {
    closed = true;
    clearReopen();
    dropSource();
    unsubscribeOnline();
  };

  const scheduleReopen = () => {
    const base = Math.min(BACKOFF_START_MS * 2 ** backoffAttempt, BACKOFF_MAX_MS);
    const delay = Math.min(base * (1 + JITTER * random()), BACKOFF_MAX_MS);
    backoffAttempt += 1;
    clearReopen();
    reopenTimer = setTimeout(() => {
      reopenTimer = null;
      open();
    }, delay);
  };

  const listen = (
    target: EventSourceLike,
    type: string,
    handle: (data: unknown) => void,
  ) => {
    target.addEventListener(type, (event) => {
      // Eventos de um source antigo ou depois do close não valem.
      if (closed || target !== source) return;
      if (event.lastEventId) {
        lastEventId = event.lastEventId;
        onLastEventId?.(event.lastEventId);
      }
      const parsed = parse(event.data);
      if (parsed.ok) handle(parsed.data);
    });
  };

  function open() {
    if (closed) return;
    dropSource();
    const current = createSource(withLastEventId(url, lastEventId));
    source = current;

    for (const [type, handler] of Object.entries(events)) {
      if (type === "sync" || type === "session.expired") continue;
      listen(current, type, handler);
    }
    listen(current, "sync", (data) => {
      consecutiveErrors = 0;
      backoffAttempt = 0;
      setStatus("live");
      events.sync?.(data);
    });
    listen(current, "session.expired", (data) => {
      events["session.expired"]?.(data);
      shutdown();
    });
    current.addEventListener("error", () => {
      if (closed || current !== source) return;
      if (current.readyState === CLOSED) {
        dropSource();
        setStatus("down");
        onClosedByServer();
        scheduleReopen();
        return;
      }
      consecutiveErrors += 1;
      setStatus(consecutiveErrors >= ERRORS_UNTIL_DOWN ? "down" : "reconnecting");
    });
  }

  const reconnectNow = () => {
    if (closed || status !== "down") return;
    // Só com reabertura agendada ou o navegador preso tentando; uma vez por queda.
    const waiting =
      reopenTimer !== null || consecutiveErrors >= ERRORS_UNTIL_DOWN;
    if (!waiting) return;
    clearReopen();
    consecutiveErrors = 0;
    open();
  };

  const unsubscribeOnline = subscribeOnline(reconnectNow);
  setStatus("connecting");
  open();

  return { close: shutdown, reconnectNow };
}
