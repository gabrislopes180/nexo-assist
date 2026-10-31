import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SignJWT, type JWTPayload } from "jose";
import { issueSessionToken, verifySessionToken } from "./session-token.js";

const secret = "segredo-de-teste-com-mais-de-32-caracteres";
const now = new Date("2026-11-09T13:00:00.000Z");
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
const nowSeconds = now.getTime() / 1000;
const key = new TextEncoder().encode(secret);

function after(ms: number): Date {
  return new Date(now.getTime() + ms);
}

function base64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/** Troca o início da assinatura: o último caractere base64url tem bits ignorados. */
function tamperSignature(token: string): string {
  const [header, payload, signature = ""] = token.split(".");
  return `${header}.${payload}.${signature.startsWith("A") ? "B" : "A"}${signature.slice(1)}`;
}

function tamperPayload(token: string): string {
  const [header, , signature] = token.split(".");
  return `${header}.${base64Url({ sub: "outro_usuario", exp: nowSeconds + 60 })}.${signature}`;
}

describe("session token", () => {
  it("devolve o userId de um token válido", async () => {
    const token = await issueSessionToken({ userId: "user_1", secret, now });
    assert.deepEqual(await verifySessionToken({ token, secret, now }), { userId: "user_1" });
  });

  it("vale até o último segundo das 8 horas e expira ao completá-las", async () => {
    const token = await issueSessionToken({ userId: "user_1", secret, now });
    assert.deepEqual(await verifySessionToken({ token, secret, now: after(EIGHT_HOURS_MS - 1000) }), { userId: "user_1" });
    assert.equal(await verifySessionToken({ token, secret, now: after(EIGHT_HOURS_MS) }), null);
  });

  it("guarda só o usuário e os horários, sem papel ou dados pessoais", async () => {
    const token = await issueSessionToken({ userId: "user_1", secret, now });
    const payload: unknown = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString());
    assert.deepEqual(payload, { sub: "user_1", iat: nowSeconds, exp: nowSeconds + 28800 });
  });

  it("recusa outro secret", async () => {
    const token = await issueSessionToken({ userId: "user_1", secret, now });
    assert.equal(await verifySessionToken({ token, secret: "outro-segredo-com-mais-de-32-caracteres", now }), null);
  });

  it("recusa token adulterado ou que não é JWT, sem lançar", async () => {
    const token = await issueSessionToken({ userId: "user_1", secret, now });
    for (const bad of [tamperSignature(token), tamperPayload(token), "", "abc", "a.b.c"]) {
      assert.equal(await verifySessionToken({ token: bad, secret, now }), null);
    }
  });

  it("recusa algoritmo diferente de HS256 mesmo assinado com o secret certo", async () => {
    for (const alg of ["HS384", "HS512"]) {
      const token = await new SignJWT({})
        .setProtectedHeader({ alg })
        .setSubject("user_1")
        .setIssuedAt(nowSeconds)
        .setExpirationTime(nowSeconds + 60)
        .sign(key);
      assert.equal(await verifySessionToken({ token, secret, now }), null);
    }
  });

  it("recusa alg none", async () => {
    const token = `${base64Url({ alg: "none" })}.${base64Url({ sub: "user_1", exp: nowSeconds + 60 })}.`;
    assert.equal(await verifySessionToken({ token, secret, now }), null);
  });

  it("recusa token assinado com sub que não é string", async () => {
    for (const sub of [123, true, { a: 1 }, ["x"]]) {
      const token = await new SignJWT({ sub } as unknown as JWTPayload)
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime(nowSeconds + 60)
        .sign(key);
      assert.equal(await verifySessionToken({ token, secret, now }), null);
    }
  });

  it("recusa token assinado sem sub, com sub vazio ou sem exp", async () => {
    const withoutSub = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setExpirationTime(nowSeconds + 60).sign(key);
    const emptySub = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject("").setExpirationTime(nowSeconds + 60).sign(key);
    const withoutExp = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject("user_1").sign(key);
    for (const token of [withoutSub, emptySub, withoutExp]) {
      assert.equal(await verifySessionToken({ token, secret, now }), null);
    }
  });
});
