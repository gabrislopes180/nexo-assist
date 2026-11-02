import { describe, expect, it } from "vitest";
import {
  formatDueTime,
  formatShortDate,
  formatShortDateTime,
} from "./format-date";

describe("formatDueTime", () => {
  const now = new Date("2026-10-20T10:00:00");

  it("mostra só a hora quando o prazo é hoje", () => {
    expect(formatDueTime("2026-10-20T13:43:00", now)).toBe("13:43");
  });

  it("mostra data e hora em outro dia", () => {
    expect(formatDueTime("2026-10-21T08:05:00", now)).toBe("21 out, 08:05");
  });
});

// Sem "Z": o Date interpreta em hora local, e o teste não depende do fuso.
describe("formatShortDate", () => {
  it("usa dia com dois dígitos e mês abreviado sem ponto", () => {
    expect(formatShortDate("2026-10-09T08:00:00")).toBe("09 out");
  });

  it("cobre o primeiro e o último mês do ano", () => {
    expect(formatShortDate("2026-01-31T08:00:00")).toBe("31 jan");
    expect(formatShortDate("2026-12-01T08:00:00")).toBe("01 dez");
  });
});

describe("formatShortDateTime", () => {
  it("acrescenta a hora local depois de vírgula", () => {
    expect(formatShortDateTime("2026-10-16T14:20:00")).toBe("16 out, 14:20");
  });

  it("mantém zero à esquerda na hora e no minuto", () => {
    expect(formatShortDateTime("2026-03-05T07:05:00")).toBe("05 mar, 07:05");
  });
});
