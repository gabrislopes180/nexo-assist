import { describe, expect, it } from "vitest";
import {
  MESSAGE_TEXT_MAX_LENGTH,
  messageTextSchema,
  parseMessageText,
} from "./message-text";

describe("messageTextSchema", () => {
  it("remove NUL e espaços das pontas", () => {
    expect(messageTextSchema.parse("  a\0b ")).toBe("ab");
  });

  it("aceita de 1 a 2000 caracteres", () => {
    expect(MESSAGE_TEXT_MAX_LENGTH).toBe(2000);
    expect(messageTextSchema.safeParse("a".repeat(2000)).success).toBe(true);
    expect(messageTextSchema.safeParse("a".repeat(2001)).success).toBe(false);
    expect(messageTextSchema.safeParse(" \0 ").success).toBe(false);
  });
});

describe("parseMessageText", () => {
  it("separa vazio de longo demais", () => {
    expect(parseMessageText(" oi ")).toEqual({ status: "ok", message: "oi" });
    expect(parseMessageText("   ")).toEqual({ status: "empty" });
    expect(parseMessageText("a".repeat(2001))).toEqual({ status: "too-long" });
  });
});
