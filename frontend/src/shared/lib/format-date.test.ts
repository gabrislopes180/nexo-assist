import { describe, expect, it } from "vitest";
import {
  formatDueTime,
  formatShortDate,
  formatShortDateTime,
  formatDayLabel,
  formatListTime,
  formatTime,
} from "./format-date";

describe("formatTime", () => {
  it("mostra hora e minuto locais", () => {
    expect(formatTime("2026-10-20T07:05:00")).toBe("07:05");
  });
});

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

describe("formatListTime", () => {
  const now = new Date("2026-10-20T10:05:30");

  it("mostra agora no último minuto", () => {
    expect(formatListTime("2026-10-20T10:05:00", now)).toBe("agora");
  });

  it("mostra a hora no mesmo dia, inclusive no futuro", () => {
    expect(formatListTime("2026-10-20T09:58:00", now)).toBe("09:58");
    expect(formatListTime("2026-10-20T11:00:00", now)).toBe("11:00");
  });

  it("mostra ontem e depois a data curta", () => {
    expect(formatListTime("2026-10-19T23:59:00", now)).toBe("ontem");
    expect(formatListTime("2026-10-16T16:40:00", now)).toBe("16 out");
  });

  it("vira o dia à meia-noite", () => {
    const midnight = new Date("2026-10-20T00:00:30");
    expect(formatListTime("2026-10-19T23:59:50", midnight)).toBe("agora");
    expect(formatListTime("2026-10-19T23:58:00", midnight)).toBe("ontem");
  });
});

describe("formatDayLabel", () => {
  const now = new Date("2026-10-20T10:00:00");

  it("rotula hoje, ontem e datas antigas", () => {
    expect(formatDayLabel("2026-10-20T01:00:00", now)).toBe("Hoje");
    expect(formatDayLabel("2026-10-19T23:00:00", now)).toBe("Ontem");
    expect(formatDayLabel("2026-10-16T08:00:00", now)).toBe("16 out");
  });
});
