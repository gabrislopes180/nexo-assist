import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEventBus, type BusEvent, type BusEventInput } from "./event-bus.js";

const tickets = (ownerId = "u1", conversationId = "c1"): BusEventInput => ({ type: "tickets.changed", ownerId, conversationId, data: null });

describe("barramento de eventos", () => {
  it("numera em sequência crescente com o bootId no id", () => {
    const bus = createEventBus({ bootId: "boot01" });
    assert.equal(bus.head(), "boot01.0");
    const first = bus.push(tickets());
    const second = bus.push(tickets());
    assert.deepEqual([first.seq, first.id, second.seq, second.id], [1, "boot01.1", 2, "boot01.2"]);
    assert.equal(bus.head(), "boot01.2");
  });

  it("gera um bootId aleatório de 6 caracteres", () => {
    const [bootId] = createEventBus().head().split(".");
    assert.match(bootId ?? "", /^[a-z0-9]{6}$/);
    assert.notEqual(createEventBus().head(), createEventBus().head());
  });

  it("replaySince devolve só os eventos depois do id", () => {
    const bus = createEventBus({ bootId: "boot01" });
    for (let i = 0; i < 4; i++) bus.push(tickets());
    assert.deepEqual(bus.replaySince("boot01.2")?.map((event) => event.seq), [3, 4]);
    assert.deepEqual(bus.replaySince("boot01.4"), []);
    assert.deepEqual(bus.replaySince("boot01.0")?.map((event) => event.seq), [1, 2, 3, 4]);
  });

  it("replaySince devolve null para outro bootId, lixo, ausente, id futuro ou mais antigo que o buffer", () => {
    const bus = createEventBus({ bootId: "boot01", bufferSize: 3 });
    for (let i = 0; i < 5; i++) bus.push(tickets());
    // Buffer com 3, 4 e 5: o id 2 ainda serve (o próximo é o 3), o 1 já não.
    assert.deepEqual(bus.replaySince("boot01.2")?.map((event) => event.seq), [3, 4, 5]);
    for (const id of ["boot01.1", "outro1.4", "zzz", "boot01.x", "boot01.-1", "boot01.9", "boot01.1.5", "", null]) {
      assert.equal(bus.replaySince(id), null, String(id));
    }
  });

  it("entrega a cada assinante e para de entregar depois de desinscrever", () => {
    const bus = createEventBus({ bootId: "boot01" });
    const received: number[] = [];
    const unsubscribe = bus.subscribe({ onEvent: (event) => received.push(event.seq) });
    assert.equal(bus.subscriberCount(), 1);
    bus.push(tickets());
    unsubscribe();
    unsubscribe();
    bus.push(tickets());
    assert.deepEqual(received, [1]);
    assert.equal(bus.subscriberCount(), 0);
  });

  it("o filtro do assinante decide o que ele recebe", () => {
    const bus = createEventBus({ bootId: "boot01" });
    const received: string[] = [];
    bus.subscribe({ filter: (event) => event.ownerId === "u1", onEvent: (event) => received.push(event.conversationId) });
    bus.push(tickets("u1", "c1"));
    bus.push(tickets("u2", "c2"));
    bus.push(tickets("u1", "c3"));
    assert.deepEqual(received, ["c1", "c3"]);
  });

  it("um assinante que lança não impede os outros", (t) => {
    t.mock.method(console, "error", () => undefined);
    const bus = createEventBus({ bootId: "boot01" });
    const received: BusEvent[] = [];
    bus.subscribe({
      onEvent: () => {
        throw new Error("falha do assinante");
      },
    });
    bus.subscribe({ onEvent: (event) => received.push(event) });
    bus.push(tickets("u2", "c9"));
    assert.deepEqual(received.map((event) => [event.ownerId, event.conversationId]), [["u2", "c9"]]);
  });

  it("closeAll avisa e remove todos os assinantes", () => {
    const bus = createEventBus({ bootId: "boot01" });
    const closed: string[] = [];
    bus.subscribe({ onEvent: () => undefined, onClose: () => closed.push("a") });
    bus.subscribe({ onEvent: () => undefined, onClose: () => closed.push("b") });
    bus.closeAll();
    assert.deepEqual(closed, ["a", "b"]);
    assert.equal(bus.subscriberCount(), 0);
  });
});
