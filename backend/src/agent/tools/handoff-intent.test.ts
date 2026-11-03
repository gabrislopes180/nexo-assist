import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { acceptsOffer, asksForPerson, declinesPerson } from "./handoff-intent.js";

describe("asksForPerson", () => {
  it("reconhece pedido de uma pessoa", () => {
    for (const message of [
      "Quero falar com um analista",
      "Falar com um analista",
      "falar com analista",
      "Me passa para um atendente",
      "Preciso de um humano",
      "Quero falar com uma pessoa",
      "chama o analista",
      "Não consegui resolver, chama o analista",
      "não aguento mais, quero um analista",
      "pode me transferir pra um analista?",
    ]) {
      assert.equal(asksForPerson(message), true, message);
    }
  });

  it("não confunde menção a pessoa com pedido", () => {
    for (const message of [
      "Não quero falar com analista",
      "não preciso de analista",
      "tenho um problema técnico",
      "alguém da equipe também tem isso",
      "outra pessoa não consegue logar",
      "o analista disse que ia resolver",
    ]) {
      assert.equal(asksForPerson(message), false, message);
    }
  });
});

describe("declinesPerson", () => {
  it("reconhece recusa", () => {
    for (const message of ["Não, obrigado", "não precisa", "nao", "agora não", "depois eu vejo", "obrigado, tá bom", "pode deixar", "deixa", "Não quero falar com analista", "dispenso"]) {
      assert.equal(declinesPerson(message), true, message);
    }
  });

  it("pedido explícito vence a palavra não", () => {
    for (const message of ["Não consegui resolver, chama o analista", "não aguento mais, quero um analista", "Falar com um analista"]) {
      assert.equal(declinesPerson(message), false, message);
    }
  });
});

describe("declinesPerson: relato de problema não é recusa", () => {
  it("frase longa que começa com não ou depois não é recusa", () => {
    for (const message of ["Não consigo acessar a VPN", "Depois do update o notebook travou", "Não consigo ver meus chamados"]) {
      assert.equal(declinesPerson(message), false, message);
    }
  });

  it("recusa explícita em qualquer lugar continua valendo", () => {
    for (const message of ["claro que não", "por favor, não", "obrigado, mas não precisa chamar ninguém"]) {
      assert.equal(declinesPerson(message), true, message);
    }
  });
});

describe("acceptsOffer", () => {
  it("aceita sim, pode, quero e a resposta rápida", () => {
    for (const message of ["Sim", "sim, por favor", "Pode", "pode chamar", "Quero", "Falar com um analista", "chama", "claro"]) {
      assert.equal(acceptsOffer(message), true, message);
    }
  });

  it("confirmação curta logo depois da oferta é aceite", () => {
    for (const message of ["Sim, confirmo", "confirmo", "pode confirmar", "ok, confirma"]) {
      assert.equal(acceptsOffer(message), true, message);
    }
    assert.equal(acceptsOffer("confirmo que o problema continua"), false);
  });

  it("aceite com cortesia antes do verbo", () => {
    for (const message of ["Tudo bem, pode chamar", "Tá bom, chama", "Obrigado, pode chamar sim", "ok, pode chamar"]) {
      assert.equal(acceptsOffer(message), true, message);
    }
  });

  it("pergunta ou frase com conteúdo depois da oferta não é aceite", () => {
    for (const message of ["quero saber quando vence", "pode me explicar o atraso?", "isso é normal?", "claro que não", "por favor, não", "salvar"]) {
      assert.equal(acceptsOffer(message), false, message);
    }
  });

  it("não trata qualquer resposta como aceite", () => {
    for (const message of ["tá certo", "e o INC-2?", "obrigado, tá bom", "depois eu vejo", "pode deixar", "Não, obrigado", "quanto tempo falta?"]) {
      assert.equal(acceptsOffer(message), false, message);
    }
  });
});
