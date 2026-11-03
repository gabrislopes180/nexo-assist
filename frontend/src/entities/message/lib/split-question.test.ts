import { describe, expect, it } from "vitest";
import { splitQuestion } from "./split-question";

describe("splitQuestion", () => {
  it("separa a última linha quando ela é pergunta", () => {
    expect(
      splitQuestion("Vou abrir um chamado.\n\nQuem está sendo afetado?"),
    ).toEqual({
      text: "Vou abrir um chamado.",
      question: "Quem está sendo afetado?",
    });
  });

  it("mantém tudo como texto quando a última linha não é pergunta", () => {
    expect(splitQuestion("Quem é afetado?\nResponda abaixo.")).toEqual({
      text: "Quem é afetado?\nResponda abaixo.",
      question: null,
    });
  });

  it("não separa quando a pergunta é o texto inteiro", () => {
    expect(splitQuestion("Quem é afetado?")).toEqual({
      text: "Quem é afetado?",
      question: null,
    });
  });
});
