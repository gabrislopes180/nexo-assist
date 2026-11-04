import { describe, expect, it } from "vitest";
import { stripSourceNote } from "./strip-source-note";

const vpn = [{ slug: "vpn-erro-809", title: "VPN com erro 809" }];
const answer = "Reinstale o perfil da VPN e tente de novo.";

describe("stripSourceNote", () => {
  it("tira a frase de fonte do artigo citado no fim", () => {
    expect(
      stripSourceNote(`${answer} Fonte: VPN com erro 809 (central de ajuda).`, vpn),
    ).toBe(answer);
  });

  it("tira a frase numa linha própria e o espaço que sobra", () => {
    expect(
      stripSourceNote(`${answer}\n\nFonte: VPN com erro 809 (central de ajuda).  \n`, vpn),
    ).toBe(answer);
  });

  it("tira a frase de fonte genérica, com outro título", () => {
    expect(
      stripSourceNote(`${answer} Fonte: VPN: erro 809 (central de ajuda).`, vpn),
    ).toBe(answer);
  });

  it("título com caracteres de regex não quebra a remoção", () => {
    const sources = [{ slug: "senha", title: "Senha (AD) expirou? [guia]" }];
    expect(
      stripSourceNote(`${answer} Fonte: Senha (AD) expirou? [guia] (central de ajuda).`, sources),
    ).toBe(answer);
  });

  it("sem fonte no trace, o texto fica como veio", () => {
    const content = `${answer} Fonte: VPN com erro 809 (central de ajuda).`;
    expect(stripSourceNote(content, undefined)).toBe(content);
    expect(stripSourceNote(content, [])).toBe(content);
  });

  it("frase de fonte no meio do texto fica", () => {
    const content = `Fonte: VPN com erro 809 (central de ajuda). ${answer}`;
    expect(stripSourceNote(content, vpn)).toBe(content);
  });

  it("tira a frase genérica mesmo com título longo", () => {
    const long = "VPN ".repeat(60).trim();
    expect(
      stripSourceNote(`${answer} Fonte: ${long} (central de ajuda).`, vpn),
    ).toBe(answer);
  });

  it("com duas frases genéricas, só a do fim sai", () => {
    const first = `${answer} Fonte: Outro (central de ajuda). Depois disso, reinicie.`;
    expect(
      stripSourceNote(`${first} Fonte: Guia VPN (central de ajuda).`, vpn),
    ).toBe(first);
  });

  it("não tira texto colado sem espaço antes", () => {
    const content = `${answer}Fonte: VPN com erro 809 (central de ajuda).`;
    expect(stripSourceNote(content, vpn)).toBe(content);
  });

  it("não mexe em texto sem a frase, nem no espaço do começo", () => {
    const content = "  Linha 1\nLinha 2 (central de ajuda).";
    expect(stripSourceNote(content, vpn)).toBe(content);
  });

  it("resposta que seria só a frase fica como veio, nunca vazia", () => {
    const content = "Fonte: VPN com erro 809 (central de ajuda).";
    expect(stripSourceNote(content, vpn)).toBe(content);
  });
});
