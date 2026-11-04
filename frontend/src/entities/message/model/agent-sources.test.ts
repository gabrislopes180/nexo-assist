import { describe, expect, it } from "vitest";
import { agentSourcesSchema } from "./agent-sources";

const vpn = { kind: "ARTICLE", slug: "vpn-erro-809", title: "VPN com erro 809" };

describe("agentSourcesSchema", () => {
  it("guarda o artigo citado só com slug e título", () => {
    expect(agentSourcesSchema.parse([vpn])).toEqual([
      { slug: "vpn-erro-809", title: "VPN com erro 809" },
    ]);
  });

  it("campo ausente fica ausente (traces antigos)", () => {
    expect(agentSourcesSchema.parse(undefined)).toBeUndefined();
  });

  it("ignora fonte de tipo desconhecido e mantém as outras", () => {
    expect(
      agentSourcesSchema.parse([{ kind: "VIDEO", slug: "x", title: "X" }, vpn]),
    ).toEqual([{ slug: "vpn-erro-809", title: "VPN com erro 809" }]);
  });

  it("descarta fonte com slug fora do formato ou título vazio", () => {
    expect(
      agentSourcesSchema.parse([
        { ...vpn, slug: "../admin" },
        { ...vpn, slug: "outro", title: "  " },
        { kind: "ARTICLE", slug: "sem-titulo" },
      ]),
    ).toEqual([]);
  });

  it("valor que não é lista vira lista vazia", () => {
    expect(agentSourcesSchema.parse("vpn-erro-809")).toEqual([]);
    expect(agentSourcesSchema.parse(null)).toEqual([]);
  });

  it("sem repetir o mesmo artigo e com no máximo 3", () => {
    const article = (slug: string) => ({ kind: "ARTICLE", slug, title: slug });
    const parsed = agentSourcesSchema.parse([
      article("a"),
      article("a"),
      article("b"),
      article("c"),
      article("d"),
    ]);
    expect(parsed?.map(({ slug }) => slug)).toEqual(["a", "b", "c"]);
  });
});
