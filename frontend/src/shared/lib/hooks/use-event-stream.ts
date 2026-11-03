import { useEffect, useEffectEvent, useState } from "react";
import { openEventStream, type StreamStatus } from "@/shared/api/event-stream";

interface UseEventStreamOptions {
  url: string;
  enabled: boolean;
  /** Recebe o JSON parseado; os nomes dos eventos não podem mudar entre renders. */
  events: Record<string, (data: unknown) => void>;
  onClosedByServer: () => void;
}

/**
 * Liga o núcleo SSE ao ciclo de vida do componente. O cleanup fecha o stream:
 * desmontar, rota escondida pela Activity, logout e troca de usuário (`key`).
 * Desligado, o status fica `down`: quem usa liga o polling de reserva.
 */
export function useEventStream({
  url,
  enabled,
  events,
  onClosedByServer,
}: UseEventStreamOptions): StreamStatus {
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const eventTypes = Object.keys(events).sort().join("|");

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
    const stream = openEventStream({
      url,
      events: handlers,
      onStatus: setStatus,
      onClosedByServer: () => closedByServer(),
    });
    return () => {
      stream.close();
      setStatus("connecting");
    };
  }, [url, enabled, eventTypes]);

  return enabled ? status : "down";
}
