import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  openEventStream,
  type EventSourceLike,
  type OpenEventStreamOptions,
  type StreamStatus,
} from "./event-stream";

const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 2;

class FakeSource implements EventSourceLike {
  readyState = CONNECTING;
  closed = false;
  private listeners = new Map<string, ((event: MessageEvent<string>) => void)[]>();

  constructor(readonly url: string) {}

  addEventListener(type: string, cb: (event: MessageEvent<string>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), cb]);
  }

  close() {
    this.closed = true;
    this.readyState = CLOSED;
  }

  emit(type: string, data: unknown, lastEventId = "") {
    this.readyState = OPEN;
    const raw = typeof data === "string" ? data : JSON.stringify(data);
    for (const cb of this.listeners.get(type) ?? []) {
      cb({ data: raw, lastEventId } as MessageEvent<string>);
    }
  }

  fail(readyState: number) {
    this.readyState = readyState;
    for (const cb of this.listeners.get("error") ?? []) {
      cb({ data: "", lastEventId: "" } as MessageEvent<string>);
    }
  }
}

function setup(
  events: Record<string, (data: unknown) => void> = {},
  extra: Partial<OpenEventStreamOptions> = {},
) {
  const sources: FakeSource[] = [];
  const statuses: StreamStatus[] = [];
  const onClosedByServer = vi.fn();
  let goOnline: () => void = () => undefined;
  const stream = openEventStream({
    url: "/api/console/events",
    events,
    onStatus: (status) => statuses.push(status),
    onClosedByServer,
    createSource: (url) => {
      const source = new FakeSource(url);
      sources.push(source);
      return source;
    },
    random: () => 0,
    subscribeOnline: (cb) => {
      goOnline = cb;
      return () => {
        goOnline = () => undefined;
      };
    },
    ...extra,
  });
  const last = () => {
    const source = sources.at(-1);
    if (!source) throw new Error("sem source");
    return source;
  };
  return { stream, sources, statuses, onClosedByServer, last, online: () => goOnline() };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("openEventStream", () => {
  it("começa conectando e só fica ao vivo com o sync", () => {
    const sync = vi.fn();
    const { statuses, last } = setup({ sync });

    expect(statuses).toEqual(["connecting"]);
    last().emit("ping-like", {});
    expect(statuses).toEqual(["connecting"]);
    last().emit("sync", { mode: "RESYNC" }, "10");
    expect(statuses).toEqual(["connecting", "live"]);
    expect(sync).toHaveBeenCalledWith({ mode: "RESYNC" });
  });

  it("entrega o JSON parseado e ignora dado inválido", () => {
    const created = vi.fn();
    const { last } = setup({ "message.created": created });

    last().emit("message.created", "{não é json");
    last().emit("message.created", { conversationId: "c1" });

    expect(created).toHaveBeenCalledTimes(1);
    expect(created).toHaveBeenCalledWith({ conversationId: "c1" });
  });

  it("reconexão nativa: reconnecting e, no terceiro erro, down", () => {
    const { statuses, last, sources } = setup();
    last().emit("sync", { mode: "RESYNC" });

    last().fail(CONNECTING);
    last().fail(CONNECTING);
    expect(statuses.at(-1)).toBe("reconnecting");
    last().fail(CONNECTING);
    expect(statuses.at(-1)).toBe("down");
    expect(sources).toHaveLength(1);
  });

  it("sync zera o contador de erros", () => {
    const { statuses, last } = setup();
    last().fail(CONNECTING);
    last().fail(CONNECTING);
    last().emit("sync", { mode: "REPLAY" });
    last().fail(CONNECTING);
    last().fail(CONNECTING);

    expect(statuses.at(-1)).toBe("reconnecting");
  });

  it("fechado pelo servidor: avisa e reabre com backoff, nunca na hora", () => {
    const { statuses, last, sources, onClosedByServer } = setup();
    last().emit("sync", { mode: "RESYNC" }, "41");

    last().fail(CLOSED);
    expect(statuses.at(-1)).toBe("down");
    expect(onClosedByServer).toHaveBeenCalledTimes(1);
    expect(sources).toHaveLength(1);

    vi.advanceTimersByTime(4_999);
    expect(sources).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sources).toHaveLength(2);
    expect(last().url).toBe("/api/console/events?lastEventId=41");
  });

  it("o backoff dobra até o teto de 60 s", () => {
    const { last, sources } = setup();
    const waits: number[] = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      const before = sources.length;
      last().fail(CLOSED);
      let waited = 0;
      while (sources.length === before) {
        vi.advanceTimersByTime(1_000);
        waited += 1_000;
      }
      waits.push(waited);
    }

    expect(waits).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000]);
  });

  it("o jitter soma até 20% sem passar do teto", () => {
    const sources: FakeSource[] = [];
    openEventStream({
      url: "/x",
      events: {},
      onStatus: () => undefined,
      onClosedByServer: () => undefined,
      createSource: (url) => {
        const source = new FakeSource(url);
        sources.push(source);
        return source;
      },
      random: () => 1,
      subscribeOnline: () => () => undefined,
    });
    sources[0]?.fail(CLOSED);

    vi.advanceTimersByTime(5_999);
    expect(sources).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sources).toHaveLength(2);
  });

  it("sync depois de reabrir zera o backoff", () => {
    const { last, sources } = setup();
    last().fail(CLOSED);
    vi.advanceTimersByTime(5_000);
    last().fail(CLOSED);
    vi.advanceTimersByTime(10_000);
    last().emit("sync", { mode: "RESYNC" });
    last().fail(CLOSED);
    vi.advanceTimersByTime(5_000);

    expect(sources).toHaveLength(4);
  });

  it("session.expired repassa e fecha sem reabrir", () => {
    const expired = vi.fn();
    const { last, sources } = setup({ "session.expired": expired });

    last().emit("session.expired", {});
    expect(expired).toHaveBeenCalledWith({});
    expect(last().closed).toBe(true);
    last().fail(CLOSED);
    vi.advanceTimersByTime(120_000);
    expect(sources).toHaveLength(1);
  });

  it("close cancela a reabertura e ignora eventos tardios", () => {
    const created = vi.fn();
    const { stream, last, sources, statuses } = setup({ "message.created": created });
    last().fail(CLOSED);
    const seen = statuses.length;

    stream.close();
    vi.advanceTimersByTime(120_000);
    sources[0]?.emit("message.created", { a: 1 });
    sources[0]?.fail(CLOSED);

    expect(sources).toHaveLength(1);
    expect(created).not.toHaveBeenCalled();
    expect(statuses).toHaveLength(seen);
  });

  it("voltar a rede com o stream caído reabre na hora", () => {
    const { last, sources, online } = setup();
    last().fail(CLOSED);

    online();
    expect(sources).toHaveLength(2);
    online();
    expect(sources).toHaveLength(2);
  });

  it("reconnectNow com o stream vivo não faz nada", () => {
    const { stream, last, sources } = setup();
    last().emit("sync", { mode: "RESYNC" });

    stream.reconnectNow();
    expect(sources).toHaveLength(1);
  });

  it("abre com o lastEventId de um stream anterior, para o servidor tentar o REPLAY", () => {
    const { last } = setup({}, { lastEventId: "57" });

    expect(last().url).toBe("/api/console/events?lastEventId=57");
  });

  it("avisa cada lastEventId novo, para quem reabrir depois continuar dali", () => {
    const onLastEventId = vi.fn();
    const { last } = setup({ "message.created": vi.fn() }, { onLastEventId });

    last().emit("sync", { mode: "RESYNC" }, "10");
    last().emit("message.created", {}, "");
    last().emit("message.created", {}, "11");

    expect(onLastEventId.mock.calls).toEqual([["10"], ["11"]]);
  });
});
