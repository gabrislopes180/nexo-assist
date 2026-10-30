import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SLA_BY_PRIORITY,
  SLA_ELAPSED_BOUNDS_HOURS,
  addBusinessMinutes,
  computeDueAt,
  isOverdue,
} from "./sla.js";

/** Horário local de São Paulo (UTC-3) → Date em UTC. */
const sp = (iso: string): Date => new Date(`${iso}:00-03:00`);
const HOUR = 60;

// Semana de referência: seg 09/11/2026 a sex 13/11/2026.
describe("addBusinessMinutes / computeDueAt", () => {
  const cases: Array<[string, Parameters<typeof computeDueAt>[0], string, string]> = [
    ["Alta seg 10:00", "HIGH", "2026-11-09T10:00", "2026-11-09T14:00"],
    ["Alta seg 14:00 termina exatamente às 18:00", "HIGH", "2026-11-09T14:00", "2026-11-09T18:00"],
    ["Alta seg 16:00 atravessa a noite", "HIGH", "2026-11-09T16:00", "2026-11-10T10:00"],
    ["Alta seg 18:00 começa fora do expediente", "HIGH", "2026-11-09T18:00", "2026-11-10T12:00"],
    ["Alta ter 07:00 antes do expediente", "HIGH", "2026-11-10T07:00", "2026-11-10T12:00"],
    ["Alta sex 17:00 atravessa o fim de semana", "HIGH", "2026-11-13T17:00", "2026-11-16T11:00"],
    ["Alta sáb 09:00", "HIGH", "2026-11-14T09:00", "2026-11-16T12:00"],
    ["Média qua 15:00", "MEDIUM", "2026-11-11T15:00", "2026-11-16T15:00"],
    ["Média ter 19:30", "MEDIUM", "2026-11-10T19:30", "2026-11-13T18:00"],
    ["Média sex 18:30", "MEDIUM", "2026-11-13T18:30", "2026-11-18T18:00"],
    ["Baixa seg 09:00", "LOW", "2026-11-09T09:00", "2026-11-16T09:00"],
    ["Crítica sáb 03:00 é tempo corrido", "CRITICAL", "2026-11-14T03:00", "2026-11-14T04:00"],
  ];

  for (const [name, priority, from, expected] of cases) {
    it(name, () => {
      assert.equal(computeDueAt(priority, sp(from)).toISOString(), sp(expected).toISOString());
    });
  }

  it("domingo 23:59 começa na segunda 08:00", () => {
    assert.equal(
      addBusinessMinutes(sp("2026-11-15T23:59"), 30).toISOString(),
      sp("2026-11-16T08:30").toISOString(),
    );
  });

  it("17:59 consome 1 minuto e continua no dia útil seguinte", () => {
    assert.equal(
      addBusinessMinutes(sp("2026-11-09T17:59"), 2).toISOString(),
      sp("2026-11-10T08:01").toISOString(),
    );
  });

  it("08:00 exato já está dentro do expediente", () => {
    assert.equal(
      addBusinessMinutes(sp("2026-11-09T08:00"), 600).toISOString(),
      sp("2026-11-09T18:00").toISOString(),
    );
  });

  it("preserva segundos dentro do expediente", () => {
    const from = new Date("2026-11-09T13:00:30.500Z"); // 10:00:30.5 local
    assert.equal(addBusinessMinutes(from, 60).toISOString(), "2026-11-09T14:00:30.500Z");
  });

  it("não altera a data de entrada", () => {
    const from = sp("2026-11-09T10:00");
    addBusinessMinutes(from, 60);
    assert.equal(from.toISOString(), sp("2026-11-09T10:00").toISOString());
  });
});

describe("SLA_BY_PRIORITY", () => {
  it("define o tipo de relógio e os minutos por prioridade", () => {
    assert.deepEqual(SLA_BY_PRIORITY, {
      CRITICAL: { clock: "CALENDAR", minutes: 60 },
      HIGH: { clock: "BUSINESS", minutes: 4 * HOUR },
      MEDIUM: { clock: "BUSINESS", minutes: 30 * HOUR },
      LOW: { clock: "BUSINESS", minutes: 50 * HOUR },
    });
  });
});

describe("limites de duração corrida", () => {
  const elapsedHours = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 3_600_000;

  it("Média: mínimo 58h (seg 08:00) e máximo 5 dias (sex 18:00)", () => {
    const min = sp("2026-11-09T08:00");
    const max = sp("2026-11-13T18:00");
    assert.equal(elapsedHours(min, computeDueAt("MEDIUM", min)), SLA_ELAPSED_BOUNDS_HOURS.MEDIUM.min);
    assert.equal(elapsedHours(max, computeDueAt("MEDIUM", max)), SLA_ELAPSED_BOUNDS_HOURS.MEDIUM.max);
    assert.deepEqual(SLA_ELAPSED_BOUNDS_HOURS.MEDIUM, { min: 58, max: 120 });
  });

  it("Baixa: mínimo 106h e máximo 7 dias", () => {
    const min = sp("2026-11-09T08:00");
    const max = sp("2026-11-13T18:00");
    assert.equal(elapsedHours(min, computeDueAt("LOW", min)), 106);
    assert.equal(elapsedHours(max, computeDueAt("LOW", max)), 168);
    assert.deepEqual(SLA_ELAPSED_BOUNDS_HOURS.LOW, { min: 106, max: 168 });
  });

  it("Alta: mínimo 4h e máximo 66h (sex 18:00 -> seg 12:00)", () => {
    const max = sp("2026-11-13T18:00");
    assert.equal(elapsedHours(max, computeDueAt("HIGH", max)), 66);
    assert.deepEqual(SLA_ELAPSED_BOUNDS_HOURS.HIGH, { min: 4, max: 66 });
  });
});

describe("isOverdue", () => {
  const now = sp("2026-11-09T10:00");
  it("vencido quando dueAt < now", () => {
    assert.equal(isOverdue({ dueAt: sp("2026-11-09T09:59") }, now), true);
  });
  it("não vencido quando dueAt == now", () => {
    assert.equal(isOverdue({ dueAt: now }, now), false);
  });
  it("sem prazo nunca está vencido", () => {
    assert.equal(isOverdue({ dueAt: null }, now), false);
  });
});
