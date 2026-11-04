import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GENERIC_TERMS, isSignificant, normalizedKeywords, normalizeSearchText } from "./search-text.js";

it("minúsculas, sem acentos e com espaços colapsados", () => {
  assert.equal(normalizeSearchText("  Conexão   VPN\n\tÉ  Lenta "), "conexao vpn e lenta");
});

it("remove cedilha e til", () => {
  assert.equal(normalizeSearchText("Atualização Ação"), "atualizacao acao");
});

it("preserva ~, ^ e crase soltos e continua removendo acentos", () => {
  assert.equal(normalizeSearchText("~/pasta ^C `cmd` Á à ã â"), "~/pasta ^c `cmd` a a a a");
});

describe("normalizedKeywords", () => {
  it("normaliza, tira repetidas e descarta as só de espaços", () => {
    assert.deepEqual(normalizedKeywords(["VPN", "vpn", "  ", "Conexão"]), ["vpn", "conexao"]);
  });
});

describe("isSignificant", () => {
  it("termo genérico sozinho não é significativo", () => {
    assert.equal(isSignificant("erro"), false);
    assert.equal(isSignificant("nao funciona"), false);
  });

  it("termos com menos de 3 letras não contam", () => {
    assert.equal(isSignificant("ti"), false);
  });

  it("basta um termo não genérico de 3 letras ou mais", () => {
    assert.equal(isSignificant("erro 809"), true);
    assert.equal(isSignificant("vpn"), true);
  });

  it("os termos genéricos já estão normalizados", () => {
    for (const term of GENERIC_TERMS) assert.equal(normalizeSearchText(term), term);
  });
});
