import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BusEvent } from "./event-bus.js";
import { serializeFor } from "./serializers.js";

const ticketsChanged = (conversationId: string | null, ticketCode: string | null): BusEvent => ({
  type: "tickets.changed",
  ownerId: "u1",
  conversationId,
  ticketCode,
  data: null,
  id: "boot.1",
  seq: 1,
});

describe("serializeFor tickets.changed", () => {
  it("analista recebe conversationId, ownerId e ticketCode", () => {
    assert.deepEqual(serializeFor({ id: "a1", role: "ANALYST" }, ticketsChanged(null, "INC-1")), {
      id: "boot.1",
      event: "tickets.changed",
      data: { conversationId: null, ownerId: "u1", ticketCode: "INC-1" },
    });
  });

  it("funcionário nunca recebe, nem o dono", () => {
    assert.equal(serializeFor({ id: "u1", role: "EMPLOYEE" }, ticketsChanged("c1", "INC-1")), null);
  });
});
