import { useEffect, useEffectEvent, useRef, useState } from "react";
import { openEventStream, type StreamStatus } from "@/shared/api/event-stream";

interface UseEventStreamOptions {
  url: string;
  enabled: boolean;
  /** Trocar conversa fecha a inscrição anterior e reinicia o cursor desse contexto. */
  scopeKey?: string;
  /** Recebe o JSON parseado; os nomes dos eventos não podem mudar entre renders. */
  events: Record<string, (data: unknown) => void>;
  onClosedByServer: () => void;
}

/**
 * Liga o núcleo SSE ao ciclo de vida do componente. O cleanup fecha o stream:
 * desmontar, rota escondida pela Activity, logout e troca de usuário (`key`).
 * Desligado, o status fica `down`: quem usa liga o polling de reserva.
 *
 * Ao reabrir (rota mostrada de novo, `enabled` de volta), continua do último
 * evento recebido: o servidor faz o REPLAY e o consumidor não precisa buscar
 * tudo de novo. Só a primeira conexão do componente (ou um id fora do buffer)
 * recebe RESYNC. Troca de usuário remonta pela `key` e começa do zero.
 */
export function useEventStream({
  url,
  enabled,
  scopeKey,
  events,
  onClosedByServer,
}: UseEventStreamOptions): StreamStatus {
  const [status, setStatus] = useState<StreamStatus>("connecting");
  // O id vale só para a mesma URL; trocar de stream começa do zero.
  const cursorRef = useRef<{ url: string; id: string } | null>(null);
  const eventTypes = Object.keys(events).sort().join("|");
  const scope = `${url}:${scopeKey ?? ""}`;

  const dispatch = useEffectEvent((type: string, data: unknown) => {
    events[type]?.(data);
  });
  const closedByServer = useEffectEvent(() => onClosedByServer());

  useEffect(() => {
    if (!enabled) return;
    const handlers = Object.fromEntries(
      eventTypes
        .split("|")
        .filter(Boolean)
        .map((type) => [type, (data: unknown) => dispatch(type, data)]),
    );
    const cursor = cursorRef.current;
    const stream = openEventStream({
      url,
      events: handlers,
      lastEventId: cursor?.url === scope ? cursor.id : null,
      onLastEventId: (id) => {
        cursorRef.current = { url: scope, id };
      },
      onStatus: setStatus,
      onClosedByServer: () => closedByServer(),
    });
    return () => {
      stream.close();
      setStatus("connecting");
    };
  }, [url, scope, enabled, eventTypes]);

  return enabled ? status : "down";
}
