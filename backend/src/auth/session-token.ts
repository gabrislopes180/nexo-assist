import { jwtVerify, SignJWT } from "jose";

export const SESSION_TTL_SECONDS = 8 * 60 * 60;

function signingKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/** O token carrega só o userId: o papel é sempre lido do banco. */
export function issueSessionToken(input: { userId: string; secret: string; now: Date }): Promise<string> {
  const issuedAt = Math.floor(input.now.getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.userId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + SESSION_TTL_SECONDS)
    .sign(signingKey(input.secret));
}

/** Nunca lança: qualquer token que não seja válido neste instante retorna `null`. `expiresAt` vem de `exp`. */
export async function verifySessionToken(input: { token: string; secret: string; now: Date }): Promise<{ userId: string; expiresAt: Date } | null> {
  try {
    const { payload } = await jwtVerify(input.token, signingKey(input.secret), {
      algorithms: ["HS256"],
      currentDate: input.now,
      requiredClaims: ["sub", "exp"],
    });
    // O jose não valida o tipo de `sub` em runtime.
    if (typeof payload.sub !== "string" || payload.sub === "" || typeof payload.exp !== "number") return null;
    return { userId: payload.sub, expiresAt: new Date(payload.exp * 1000) };
  } catch {
    return null;
  }
}
