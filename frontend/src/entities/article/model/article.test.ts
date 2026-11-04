import { describe, expect, it } from "vitest";
import { articleResponseSchema } from "./article";

const article = {
  slug: "vpn-erro-809",
  title: "VPN com erro 809",
  category: "NETWORK_VPN",
  content: "1. Abra o cliente da VPN.\n2. Reinstale o perfil.",
  updatedAt: "2026-10-16T17:20:00.000Z",
};

describe("articleResponseSchema", () => {
  it("lê o artigo completo, com as quebras de linha", () => {
    expect(articleResponseSchema.parse({ article })).toEqual(article);
  });

  it("categoria desconhecida vira null sem derrubar o artigo", () => {
    expect(
      articleResponseSchema.parse({ article: { ...article, category: "PRINTERS" } })
        .category,
    ).toBeNull();
  });

  it("data fora do formato vira null", () => {
    expect(
      articleResponseSchema.parse({ article: { ...article, updatedAt: "ontem" } })
        .updatedAt,
    ).toBeNull();
  });

  it("recusa artigo sem título ou sem texto", () => {
    const noTitle: Record<string, unknown> = { ...article };
    delete noTitle.title;
    expect(articleResponseSchema.safeParse({ article: noTitle }).success).toBe(false);
    expect(
      articleResponseSchema.safeParse({ article: { ...article, content: 3 } }).success,
    ).toBe(false);
  });
});
