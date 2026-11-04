import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/api-error";
import { getArticle } from "./get-article";

const article = {
  slug: "vpn-erro-809",
  title: "VPN com erro 809",
  category: "NETWORK_VPN",
  content: "Passo 1.\nPasso 2.",
  updatedAt: "2026-10-16T17:20:00.000Z",
};

function stubResponse(status: number, body: string) {
  const fetchMock = vi.fn(async () => new Response(body, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("getArticle", () => {
  it("busca o artigo pelo slug e devolve o artigo", async () => {
    const fetchMock = stubResponse(200, JSON.stringify({ article }));

    await expect(getArticle("vpn-erro-809")).resolves.toEqual(article);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/help/articles/vpn-erro-809",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("codifica o slug na URL", async () => {
    const fetchMock = stubResponse(200, JSON.stringify({ article }));

    await getArticle("a/b?c");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/help/articles/a%2Fb%3Fc",
      expect.anything(),
    );
  });

  it("lança o 404 do backend com o código", async () => {
    stubResponse(
      404,
      '{"error":{"code":"ARTICLE_NOT_FOUND","message":"x"}}',
    );

    const error: unknown = await getArticle("sumiu").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, code: "ARTICLE_NOT_FOUND" });
  });
});
