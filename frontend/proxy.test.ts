import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "./proxy";

function run(path: string, cookie?: string) {
  const headers = new Headers();
  if (cookie !== undefined) headers.set("cookie", `nexo_session=${cookie}`);
  return proxy(new NextRequest(`http://localhost:3000${path}`, { headers }));
}

describe("proxy", () => {
  it("cobre só as rotas autenticadas", () => {
    expect(config.matcher).toEqual(["/", "/console/:path*", "/profile"]);
  });

  it.each([
    ["/", undefined],
    ["/console", undefined],
    ["/console/employee", undefined],
    ["/profile", undefined],
    ["/", ""],
    ["/console", ""],
    ["/console/employee", ""],
    ["/profile", ""],
  ])("redireciona %s com cookie %j para /login", (path, cookie) => {
    const response = run(path, cookie);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login",
    );
  });

  it.each(["/", "/console"])("leva %s com cookie ao atendimento", (path) => {
    expect(run(path, "qualquer-valor").headers.get("location")).toBe(
      "http://localhost:3000/console/employee",
    );
  });

  it.each(["/console/employee", "/profile"])(
    "deixa %s com cookie seguir",
    (path) => {
      const response = run(path, "qualquer-valor");

      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBe("1");
    },
  );
});
