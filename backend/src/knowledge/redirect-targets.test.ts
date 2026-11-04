import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { REDIRECT_AREAS, REDIRECT_TARGETS, redirectReply, redirectSummary } from "./redirect-targets.js";

describe("redirect-targets", () => {
  it("cada área tem rótulo, canal e exemplos do que cobre", () => {
    for (const area of REDIRECT_AREAS) {
      const target = REDIRECT_TARGETS[area];
      assert.ok(target.channel.length > 0, area);
      assert.ok(target.covers.length > 0, area);
    }
  });

  it("monta o texto exato de cada área", () => {
    assert.equal(redirectReply("RH"), "Isso é com o RH. Fale com eles pelo Portal do Colaborador (menu RH) ou em rh@nexo.example.");
    assert.equal(redirectReply("FINANCEIRO"), "Isso é com o Financeiro. Fale com eles em financeiro@nexo.example.");
    assert.equal(redirectReply("FACILITIES"), "Isso é com Facilities. Fale com eles em facilities@nexo.example ou pelo ramal 2200.");
  });

  it("resumo do trace usa o rótulo", () => {
    assert.equal(redirectSummary("RH"), "Encaminhado para o RH.");
    assert.equal(redirectSummary("FACILITIES"), "Encaminhado para Facilities.");
  });
});
