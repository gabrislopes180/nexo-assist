import type { CookieOptions, RequestHandler, Response } from "express";
import { SESSION_TTL_SECONDS, verifySessionToken } from "../auth/session-token.js";
import type { SessionUser } from "../shared/session.js";
import type { ApiConfig } from "./config.js";
import type { AppDeps } from "./deps.js";
import { ApiError } from "./errors.js";

const SESSION_COOKIE = "nexo_session";

/** Set e clear precisam dos mesmos atributos, ou o navegador não remove o cookie. */
function cookieOptions(config: ApiConfig): CookieOptions {
  return { httpOnly: true, sameSite: "lax", secure: config.isProduction, path: "/" };
}

function sessionInvalid(): ApiError {
  return new ApiError(401, "SESSION_INVALID", "Sessão inválida ou expirada.");
}

function readSessionCookie(cookies: unknown): unknown {
  if (typeof cookies !== "object" || cookies === null) return undefined;
  return (cookies as Record<string, unknown>)[SESSION_COOKIE];
}

export function setSessionCookie(res: Response, token: string, config: ApiConfig): void {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(config), maxAge: SESSION_TTL_SECONDS * 1000 });
}

export function clearSessionCookie(res: Response, config: ApiConfig): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions(config));
}

/** Erro de banco se propaga sem limpar o cookie: a sessão pode continuar válida. */
export function requireSession(deps: AppDeps): RequestHandler {
  return async (req, res, next) => {
    const token = readSessionCookie(req.cookies as unknown);
    if (token === undefined || token === "") {
      throw new ApiError(401, "SESSION_MISSING", "Sessão não encontrada.");
    }
    // O cookie-parser transforma valores `j:` em objeto.
    const session =
      typeof token === "string" ? await verifySessionToken({ token, secret: deps.config.sessionSecret, now: new Date() }) : null;
    const user = session ? await deps.authService.findSessionUser(session.userId) : null;
    if (!user) {
      clearSessionCookie(res, deps.config);
      throw sessionInvalid();
    }
    res.locals.sessionUser = user;
    next();
  };
}

/** Para rotas atrás de `requireSession`; sem o middleware é erro de programação. */
export function sessionUserOf(res: Response): SessionUser {
  const user: unknown = res.locals.sessionUser;
  if (!user) throw new Error("sessionUserOf chamado em rota sem requireSession");
  return user as SessionUser;
}
