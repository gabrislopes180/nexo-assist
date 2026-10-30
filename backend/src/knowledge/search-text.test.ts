import assert from "node:assert/strict";
import { it } from "node:test";
import { normalizeSearchText } from "./search-text.js";

it("minúsculas, sem acentos e com espaços colapsados", () => {
  assert.equal(normalizeSearchText("  Conexão   VPN\n\tÉ  Lenta "), "conexao vpn e lenta");
});

it("remove cedilha e til", () => {
  assert.equal(normalizeSearchText("Atualização Ação"), "atualizacao acao");
});

it("preserva ~, ^ e crase soltos e continua removendo acentos", () => {
  assert.equal(normalizeSearchText("~/pasta ^C `cmd` Á à ã â"), "~/pasta ^c `cmd` a a a a");
});
