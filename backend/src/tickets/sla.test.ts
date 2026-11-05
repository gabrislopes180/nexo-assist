import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import {
  SLA_BY_PRIORITY,
  SLA_ELAPSED_BOUNDS_HOURS,
  addBusinessMinutes,
  computeDueAt,
  formatLocalDateTime,
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
    ["Alta sex 14:00 ainda termina na sexta", "HIGH", "2026-11-13T14:00", "2026-11-13T18:00"],
    ["Alta sex 18:00 começa na segunda", "HIGH", "2026-11-13T18:00", "2026-11-16T12:00"],
    ["Alta sex 23:30 não consome prazo à noite", "HIGH", "2026-11-13T23:30", "2026-11-16T12:00"],
    ["Alta sáb 09:00", "HIGH", "2026-11-14T09:00", "2026-11-16T12:00"],
    ["Alta dom 23:59", "HIGH", "2026-11-15T23:59", "2026-11-16T12:00"],
    ["Alta atravessa mês e ano sem descontar feriados", "HIGH", "2026-12-31T17:00", "2027-01-01T11:00"],
    ["Alta atravessa fevereiro em ano bissexto", "HIGH", "2028-02-28T17:00", "2028-02-29T11:00"],
    ["Média acumula 30h, e não avança três datas úteis", "MEDIUM", "2026-11-09T08:00", "2026-11-11T18:00"],
    ["Média qua 15:00", "MEDIUM", "2026-11-11T15:00", "2026-11-16T15:00"],
    ["Média ter 19:30", "MEDIUM", "2026-11-10T19:30", "2026-11-13T18:00"],
    ["Média sex 18:30", "MEDIUM", "2026-11-13T18:30", "2026-11-18T18:00"],
    ["Baixa seg 09:00", "LOW", "2026-11-09T09:00", "2026-11-16T09:00"],
    ["Baixa acumula 50h de expediente", "LOW", "2026-11-09T08:00", "2026-11-13T18:00"],
    ["Baixa sex 18:00", "LOW", "2026-11-13T18:00", "2026-11-20T18:00"],
    ["Crítica sex 17:00 termina no fechamento", "CRITICAL", "2026-11-13T17:00", "2026-11-13T18:00"],
    ["Crítica sex 18:00 não espera o expediente", "CRITICAL", "2026-11-13T18:00", "2026-11-13T19:00"],
    ["Crítica sex 23:30 atravessa a data e entra no sábado", "CRITICAL", "2026-11-13T23:30", "2026-11-14T00:30"],
    ["Crítica sáb 03:00 é tempo corrido", "CRITICAL", "2026-11-14T03:00", "2026-11-14T04:00"],
    ["Crítica dom 23:30 termina antes da abertura", "CRITICAL", "2026-11-15T23:30", "2026-11-16T00:30"],
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

  it("preserva frações de segundo no saldo que atravessa a sexta-feira", () => {
    const from = new Date("2026-11-13T17:59:59.500-03:00");
    assert.equal(computeDueAt("HIGH", from).toISOString(), "2026-11-16T14:59:59.500Z");
  });

  it("não altera a data de entrada", () => {
    const from = sp("2026-11-09T10:00");
    addBusinessMinutes(from, 60);
    assert.equal(from.toISOString(), sp("2026-11-09T10:00").toISOString());
  });
});

describe("fuso operacional independente do servidor", () => {
  for (const timezone of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
    it(`calcula e formata em UTC-3 mesmo com servidor em ${timezone}`, () => {
      // Cada processo inicia com outro TZ, sem alterar o ambiente dos demais testes.
      const script = `
        import { computeDueAt, formatLocalDateTime } from ${JSON.stringify(new URL("./sla.ts", import.meta.url).href)};
        const high = computeDueAt("HIGH", new Date("2026-11-13T20:00:00.000Z"));
        console.log(JSON.stringify({
          high: high.toISOString(),
          critical: computeDueAt("CRITICAL", new Date("2026-11-14T02:30:00.000Z")).toISOString(),
          medium: computeDueAt("MEDIUM", new Date("2026-11-09T11:00:00.000Z")).toISOString(),
          low: computeDueAt("LOW", new Date("2026-11-09T11:00:00.000Z")).toISOString(),
          display: formatLocalDateTime(high),
          previousLocalDate: formatLocalDateTime(new Date("2027-01-01T02:30:00.000Z")),
        }));
      `;
      const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
        cwd: new URL("../../", import.meta.url),
        env: { ...process.env, TZ: timezone }, encoding: "utf8", timeout: 15000,
      });
      assert.equal(result.status, 0, result.stderr || result.error?.message || "Falha no processo de teste de fuso");
      assert.deepEqual(JSON.parse(result.stdout), {
        high: "2026-11-16T14:00:00.000Z",
        critical: "2026-11-14T03:30:00.000Z",
        medium: "2026-11-11T21:00:00.000Z",
        low: "2026-11-13T21:00:00.000Z",
        display: "16/11 às 11:00",
        previousLocalDate: "31/12 às 23:30",
      });
    });
  }

  it("formata a data local quando a data UTC já é a seguinte", () => {
    assert.equal(formatLocalDateTime(new Date("2026-11-14T02:30:00.000Z")), "13/11 às 23:30");
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
  it("só vence depois do instante limite, com precisão de milissegundos", () => {
    assert.equal(isOverdue({ dueAt: now }, new Date(now.getTime() - 1)), false);
    assert.equal(isOverdue({ dueAt: now }, new Date(now.getTime() + 1)), true);
  });
  it("sem prazo nunca está vencido", () => {
    assert.equal(isOverdue({ dueAt: null }, now), false);
  });
});
