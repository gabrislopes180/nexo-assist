import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "./proxy";

function run(path: string, cookie?: string) {
  const headers = new Headers();
  if (cookie !== undefined) headers.set("cookie", `nexo_session=${cookie}`);
  return proxy(new NextRequest(`http://localhost:3000${path}`, { headers }));
}

describe("proxy", () => {
  it("deixa /login fora do matcher", () => {
    expect(config.matcher).toEqual(["/", "/test"]);
  });

  it.each([
    ["/", undefined],
    ["/test", undefined],
    ["/", ""],
    ["/test", ""],
  ])("redireciona %s com cookie %j para /login", (path, cookie) => {
    const response = run(path, cookie);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login",
    );
  });

  it("leva / com cookie para /test", () => {
    const response = run("/", "qualquer-valor");

    expect(response.headers.get("location")).toBe("http://localhost:3000/test");
  });

  it("deixa /test com cookie seguir", () => {
    const response = run("/test", "qualquer-valor");

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
