import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONVERSATION_MESSAGE_LIMIT, remainingMessages } from "./conversation-rules.js";

describe("conversation-rules", () => {
  it("limita a 30 mensagens do funcionário", () => {
    assert.equal(CONVERSATION_MESSAGE_LIMIT, 30);
  });

  it("calcula as mensagens restantes sem ficar negativo", () => {
    assert.equal(remainingMessages(1), 29);
    assert.equal(remainingMessages(30), 0);
    assert.equal(remainingMessages(31), 0);
  });
});
