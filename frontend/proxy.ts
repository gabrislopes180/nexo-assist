import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "nexo_session";

// Só olha a presença do cookie: quem valida a sessão é o backend. Por isso
// /login fica fora do matcher, ou um cookie adulterado criaria um laço.
export function proxy(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (!hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (request.nextUrl.pathname === "/") {
    return NextResponse.redirect(new URL("/test", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/test"],
};
