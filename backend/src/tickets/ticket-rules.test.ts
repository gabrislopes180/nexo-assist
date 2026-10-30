import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeDueAt } from "./sla.js";
import {
  InvalidTicketTransitionError,
  OPEN_STATUSES,
  REOPEN_WINDOW_MS,
  TICKET_CATEGORY_LABEL,
  TICKET_PRIORITY_LABEL,
  TICKET_STATUS_LABEL,
  TICKET_TYPE_LABEL,
  applyTicketEvent,
  canReopen,
  canTransition,
  initialTimeline,
  isOpen,
  type TicketEventInput,
  type TicketTimeline,
} from "./ticket-rules.js";

const sp = (iso: string): Date => new Date(`${iso}:00-03:00`);
const DAY_MS = 86_400_000;

function created(
  type: "INC" | "REQ" = "INC",
  priority: TicketTimeline["priority"] = "HIGH",
  at = sp("2026-11-09T10:00"),
): TicketTimeline {
  return initialTimeline({ type, priority, at }).next;
}

function apply(state: TicketTimeline, event: TicketEventInput, now: Date = event.at) {
  return applyTicketEvent(state, event, now);
}

function pause(state: TicketTimeline, at = sp("2026-11-09T11:00")): TicketTimeline {
  return apply(state, { type: "STATUS_CHANGED", actorType: "ANALYST", at, toStatus: "WAITING_EMPLOYEE" }).next;
}

describe("rótulos e status abertos", () => {
  it("rótulos em português", () => {
    assert.equal(TICKET_STATUS_LABEL.WAITING_ANALYST, "Aguardando analista");
    assert.equal(TICKET_STATUS_LABEL.IN_PROGRESS, "Em andamento");
    assert.equal(TICKET_STATUS_LABEL.WAITING_EMPLOYEE, "Aguardando funcionário");
    assert.equal(TICKET_STATUS_LABEL.APPROVED, "Aprovado");
    assert.equal(TICKET_STATUS_LABEL.RESOLVED, "Resolvido");
    assert.equal(TICKET_CATEGORY_LABEL.NETWORK_VPN, "Rede e VPN");
    assert.equal(TICKET_CATEGORY_LABEL.OTHER, "Outros");
    assert.equal(TICKET_PRIORITY_LABEL.MEDIUM, "Média");
    assert.equal(TICKET_TYPE_LABEL.REQ, "Requisição");
  });

  it("RESOLVED é o único status fechado", () => {
    assert.deepEqual([...OPEN_STATUSES].sort(), ["APPROVED", "IN_PROGRESS", "WAITING_ANALYST", "WAITING_EMPLOYEE"]);
    assert.equal(isOpen({ status: "RESOLVED" }), false);
    assert.equal(isOpen({ status: "WAITING_EMPLOYEE" }), true);
  });
});

describe("canTransition", () => {
  it("APPROVED só existe para REQ", () => {
    assert.equal(canTransition("INC", "IN_PROGRESS", "APPROVED"), false);
    assert.equal(canTransition("INC", "WAITING_ANALYST", "APPROVED"), false);
    assert.equal(canTransition("REQ", "WAITING_ANALYST", "APPROVED"), true);
    assert.equal(canTransition("REQ", "IN_PROGRESS", "APPROVED"), true);
  });

  it("analista não leva o chamado de volta para WAITING_ANALYST", () => {
    assert.equal(canTransition("INC", "IN_PROGRESS", "WAITING_ANALYST"), false);
    assert.equal(canTransition("INC", "WAITING_EMPLOYEE", "WAITING_ANALYST"), false);
  });

  it("SYSTEM só faz WAITING_EMPLOYEE -> WAITING_ANALYST", () => {
    assert.equal(canTransition("INC", "WAITING_EMPLOYEE", "WAITING_ANALYST", "SYSTEM"), true);
    assert.equal(canTransition("INC", "WAITING_ANALYST", "IN_PROGRESS", "SYSTEM"), false);
  });

  it("funcionário e agent não mudam status", () => {
    assert.equal(canTransition("INC", "WAITING_ANALYST", "IN_PROGRESS", "EMPLOYEE"), false);
    assert.equal(canTransition("INC", "WAITING_ANALYST", "RESOLVED", "AGENT"), false);
  });

  it("RESOLVED não sai por STATUS_CHANGED", () => {
    assert.equal(canTransition("INC", "RESOLVED", "WAITING_ANALYST"), false);
    assert.equal(canTransition("INC", "RESOLVED", "IN_PROGRESS"), false);
  });

  it("transições válidas do analista", () => {
    assert.equal(canTransition("INC", "WAITING_ANALYST", "IN_PROGRESS"), true);
    assert.equal(canTransition("INC", "WAITING_ANALYST", "WAITING_EMPLOYEE"), true);
    assert.equal(canTransition("INC", "WAITING_ANALYST", "RESOLVED"), true);
    assert.equal(canTransition("INC", "IN_PROGRESS", "RESOLVED"), true);
    assert.equal(canTransition("INC", "WAITING_EMPLOYEE", "IN_PROGRESS"), true);
    assert.equal(canTransition("INC", "WAITING_EMPLOYEE", "RESOLVED"), true);
    assert.equal(canTransition("REQ", "APPROVED", "IN_PROGRESS"), true);
    assert.equal(canTransition("REQ", "APPROVED", "WAITING_EMPLOYEE"), true);
    assert.equal(canTransition("REQ", "APPROVED", "RESOLVED"), true);
  });

  it("mesmo status não é transição", () => {
    assert.equal(canTransition("INC", "IN_PROGRESS", "IN_PROGRESS"), false);
  });
});

describe("initialTimeline", () => {
  it("começa em WAITING_ANALYST com prazo a partir da criação", () => {
    const at = sp("2026-11-09T10:00");
    const { next, eventDueAt } = initialTimeline({ type: "INC", priority: "HIGH", at });
    assert.equal(next.status, "WAITING_ANALYST");
    assert.deepEqual(next.slaStartedAt, at);
    assert.deepEqual(next.dueAt, sp("2026-11-09T14:00"));
    assert.deepEqual(eventDueAt, next.dueAt);
    assert.deepEqual(next.updatedAt, at);
    assert.equal(next.resolvedAt, null);
  });
});

describe("applyTicketEvent", () => {
  it("STATUS_CHANGED por analista para IN_PROGRESS renova o prazo", () => {
    const at = sp("2026-11-09T12:00");
    const r = apply(created(), { type: "STATUS_CHANGED", actorType: "ANALYST", at, toStatus: "IN_PROGRESS" });
    assert.equal(r.next.status, "IN_PROGRESS");
    assert.equal(r.fromStatus, "WAITING_ANALYST");
    assert.equal(r.fromPriority, null);
    assert.deepEqual(r.next.slaStartedAt, at);
    assert.deepEqual(r.next.dueAt, sp("2026-11-09T16:00"));
    assert.deepEqual(r.eventDueAt, r.next.dueAt);
    assert.deepEqual(r.next.updatedAt, at);
  });

  it("STATUS_CHANGED para APPROVED em REQ renova o prazo", () => {
    const at = sp("2026-11-09T12:00");
    const r = apply(created("REQ"), { type: "STATUS_CHANGED", actorType: "ANALYST", at, toStatus: "APPROVED" });
    assert.equal(r.next.status, "APPROVED");
    assert.deepEqual(r.next.slaStartedAt, at);
  });

  it("APPROVED em INC é proibido", () => {
    assert.throws(
      () => apply(created("INC"), { type: "STATUS_CHANGED", actorType: "ANALYST", at: sp("2026-11-09T11:00"), toStatus: "APPROVED" }),
      InvalidTicketTransitionError,
    );
  });

  it("STATUS_CHANGED por funcionário ou agent é proibido", () => {
    for (const actorType of ["EMPLOYEE", "AGENT"] as const) {
      assert.throws(
        () => apply(created(), { type: "STATUS_CHANGED", actorType, at: sp("2026-11-09T11:00"), toStatus: "IN_PROGRESS" }),
        InvalidTicketTransitionError,
      );
    }
  });

  it("STATUS_CHANGED sem toStatus é inválido", () => {
    assert.throws(
      () => apply(created(), { type: "STATUS_CHANGED", actorType: "ANALYST", at: sp("2026-11-09T11:00") }),
      InvalidTicketTransitionError,
    );
  });

  it("WAITING_EMPLOYEE pausa o prazo", () => {
    const r = apply(created(), { type: "STATUS_CHANGED", actorType: "ANALYST", at: sp("2026-11-09T11:00"), toStatus: "WAITING_EMPLOYEE" });
    assert.equal(r.next.status, "WAITING_EMPLOYEE");
    assert.equal(r.next.dueAt, null);
    assert.equal(r.next.slaStartedAt, null);
    assert.equal(r.eventDueAt, null);
  });

  it("resposta do funcionário em WAITING_EMPLOYEE: COMMENT não renova e SYSTEM devolve à fila com nova janela", () => {
    const paused = pause(created());
    const answerAt = sp("2026-11-10T09:00");
    const comment = apply(paused, { type: "COMMENT", actorType: "EMPLOYEE", at: answerAt });
    assert.equal(comment.next.status, "WAITING_EMPLOYEE");
    assert.equal(comment.next.dueAt, null);
    assert.equal(comment.eventDueAt, null);

    const back = apply(comment.next, { type: "STATUS_CHANGED", actorType: "SYSTEM", at: answerAt, toStatus: "WAITING_ANALYST" });
    assert.equal(back.next.status, "WAITING_ANALYST");
    assert.equal(back.fromStatus, "WAITING_EMPLOYEE");
    assert.deepEqual(back.next.slaStartedAt, answerAt);
    assert.deepEqual(back.next.dueAt, sp("2026-11-10T13:00"));
    assert.deepEqual(back.eventDueAt, back.next.dueAt);
  });

  it("SYSTEM não pode fazer outras transições", () => {
    assert.throws(
      () => apply(created(), { type: "STATUS_CHANGED", actorType: "SYSTEM", at: sp("2026-11-09T11:00"), toStatus: "IN_PROGRESS" }),
      InvalidTicketTransitionError,
    );
  });

  it("COMMENT do funcionário ou do agent não renova o prazo", () => {
    const start = created();
    for (const actorType of ["EMPLOYEE", "AGENT"] as const) {
      const at = sp("2026-11-09T13:00");
      const r = apply(start, { type: "COMMENT", actorType, at });
      assert.deepEqual(r.next.dueAt, start.dueAt);
      assert.deepEqual(r.next.slaStartedAt, start.slaStartedAt);
      assert.equal(r.eventDueAt, null);
      assert.deepEqual(r.next.updatedAt, at);
    }
  });

  it("COMMENT do analista renova o prazo", () => {
    const at = sp("2026-11-09T13:00");
    const r = apply(created(), { type: "COMMENT", actorType: "ANALYST", at });
    assert.deepEqual(r.next.slaStartedAt, at);
    assert.deepEqual(r.next.dueAt, sp("2026-11-09T17:00"));
    assert.deepEqual(r.eventDueAt, r.next.dueAt);
  });

  it("COMMENT do analista em WAITING_EMPLOYEE não reativa o prazo", () => {
    const r = apply(pause(created()), { type: "COMMENT", actorType: "ANALYST", at: sp("2026-11-09T12:00") });
    assert.equal(r.next.dueAt, null);
    assert.equal(r.eventDueAt, null);
  });

  it("COMMENT em RESOLVED é proibido", () => {
    const resolved = apply(created(), { type: "STATUS_CHANGED", actorType: "ANALYST", at: sp("2026-11-09T11:00"), toStatus: "RESOLVED" }).next;
    assert.throws(
      () => apply(resolved, { type: "COMMENT", actorType: "EMPLOYEE", at: sp("2026-11-09T12:00") }),
      InvalidTicketTransitionError,
    );
  });

  it("RESOLVED zera o prazo e grava resolvedAt", () => {
    const at = sp("2026-11-09T11:00");
    const r = apply(created(), { type: "STATUS_CHANGED", actorType: "ANALYST", at, toStatus: "RESOLVED" });
    assert.equal(r.next.status, "RESOLVED");
    assert.deepEqual(r.next.resolvedAt, at);
    assert.equal(r.next.dueAt, null);
    assert.equal(r.next.slaStartedAt, null);
    assert.equal(r.eventDueAt, null);
  });

  it("PRIORITY_CHANGED elevando LOW para HIGH: prazo a partir da mudança, sem nunca adiar", () => {
    // LOW criado seg 10:00; vira HIGH ter 09:00. Pela janela original venceria seg 14:00 (já passou).
    const start = created("INC", "LOW", sp("2026-11-09T10:00"));
    const r = apply(start, { type: "PRIORITY_CHANGED", actorType: "ANALYST", at: sp("2026-11-10T09:00"), toPriority: "HIGH" });
    assert.equal(r.next.priority, "HIGH");
    assert.equal(r.fromPriority, "LOW");
    assert.equal(r.fromStatus, null);
    assert.deepEqual(r.next.slaStartedAt, sp("2026-11-09T10:00"));
    assert.deepEqual(r.next.dueAt, sp("2026-11-10T13:00"));
    assert.ok(start.dueAt !== null && r.next.dueAt !== null && r.next.dueAt <= start.dueAt);
    assert.deepEqual(r.eventDueAt, r.next.dueAt);
  });

  it("PRIORITY_CHANGED elevando dentro do prazo: nunca adia o prazo atual", () => {
    // HIGH criado seg 09:00 vence 13:00; elevado a CRITICAL às 12:30 (12:30 + 1h = 13:30) continua vencendo 13:00.
    const start = created("INC", "HIGH", sp("2026-11-09T09:00"));
    const r = apply(start, { type: "PRIORITY_CHANGED", actorType: "ANALYST", at: sp("2026-11-09T12:30"), toPriority: "CRITICAL" });
    assert.deepEqual(start.dueAt, sp("2026-11-09T13:00"));
    assert.deepEqual(r.next.dueAt, sp("2026-11-09T13:00"));
    assert.deepEqual(r.eventDueAt, r.next.dueAt);
    assert.deepEqual(r.next.slaStartedAt, sp("2026-11-09T09:00"));
  });

  it("PRIORITY_CHANGED elevando um chamado já vencido: continua vencido", () => {
    // HIGH criado seg 09:00 venceu 13:00; elevado a CRITICAL às 15:00 não ganha prazo novo (16:00).
    const start = created("INC", "HIGH", sp("2026-11-09T09:00"));
    const at = sp("2026-11-09T15:00");
    const r = apply(start, { type: "PRIORITY_CHANGED", actorType: "ANALYST", at, toPriority: "CRITICAL" });
    assert.deepEqual(r.next.dueAt, sp("2026-11-09T13:00"));
    assert.ok(r.next.dueAt !== null && r.next.dueAt < at);
  });

  it("PRIORITY_CHANGED: LOW aberto há 2 dias elevado a CRITICAL não fica vencido no ato", () => {
    const start = created("INC", "LOW", sp("2026-11-09T10:00"));
    const at = sp("2026-11-11T10:00");
    const r = apply(start, { type: "PRIORITY_CHANGED", actorType: "ANALYST", at, toPriority: "CRITICAL" });
    assert.equal(r.next.priority, "CRITICAL");
    assert.deepEqual(r.next.dueAt, sp("2026-11-11T11:00"));
    assert.ok(r.next.dueAt !== null && r.next.dueAt > at);
    assert.deepEqual(r.next.slaStartedAt, sp("2026-11-09T10:00"));
  });

  it("PRIORITY_CHANGED rebaixando: recalcula a partir de slaStartedAt", () => {
    // HIGH criado seg 10:00, vencido desde 14:00; rebaixado para MEDIUM na ter 09:00.
    const start = created("INC", "HIGH", sp("2026-11-09T10:00"));
    const at = sp("2026-11-10T09:00");
    const r = apply(start, { type: "PRIORITY_CHANGED", actorType: "ANALYST", at, toPriority: "MEDIUM" });
    assert.equal(r.next.priority, "MEDIUM");
    assert.deepEqual(r.next.dueAt, computeDueAt("MEDIUM", sp("2026-11-09T10:00")));
    assert.notDeepEqual(r.next.dueAt, computeDueAt("MEDIUM", at));
    assert.deepEqual(r.eventDueAt, r.next.dueAt);
  });

  it("PRIORITY_CHANGED rebaixando não \"desvence\" um chamado já vencido", () => {
    // CRITICAL criado seg 10:00 (venceu 11:00); rebaixado para HIGH às 15:00.
    const start = created("INC", "CRITICAL", sp("2026-11-09T10:00"));
    const at = sp("2026-11-09T15:00");
    const r = apply(start, { type: "PRIORITY_CHANGED", actorType: "ANALYST", at, toPriority: "HIGH" });
    assert.deepEqual(r.next.dueAt, sp("2026-11-09T14:00"));
    assert.ok(r.next.dueAt !== null && r.next.dueAt < at);
  });

  it("PRIORITY_CHANGED com prazo pausado só troca a prioridade", () => {
    const r = apply(pause(created()), { type: "PRIORITY_CHANGED", actorType: "ANALYST", at: sp("2026-11-09T12:00"), toPriority: "CRITICAL" });
    assert.equal(r.next.priority, "CRITICAL");
    assert.equal(r.next.dueAt, null);
    assert.equal(r.eventDueAt, null);
  });

  it("PRIORITY_CHANGED para a mesma prioridade ou sem toPriority é inválido", () => {
    assert.throws(
      () => apply(created("INC", "HIGH"), { type: "PRIORITY_CHANGED", actorType: "ANALYST", at: sp("2026-11-09T11:00"), toPriority: "HIGH" }),
      InvalidTicketTransitionError,
    );
    assert.throws(
      () => apply(created(), { type: "PRIORITY_CHANGED", actorType: "ANALYST", at: sp("2026-11-09T11:00") }),
      InvalidTicketTransitionError,
    );
  });

  it("TRANSFERRED não mexe no prazo", () => {
    const start = created();
    const at = sp("2026-11-09T10:05");
    const r = apply(start, { type: "TRANSFERRED", actorType: "AGENT", at });
    assert.deepEqual(r.next.dueAt, start.dueAt);
    assert.deepEqual(r.next.slaStartedAt, start.slaStartedAt);
    assert.equal(r.eventDueAt, null);
    assert.deepEqual(r.next.updatedAt, at);
  });

  it("CREATED não pode ser aplicado sobre um chamado existente", () => {
    assert.throws(
      () => apply(created(), { type: "CREATED", actorType: "EMPLOYEE", at: sp("2026-11-09T11:00") }),
      InvalidTicketTransitionError,
    );
  });

  it("não altera o estado de entrada", () => {
    const start = created();
    const snapshot = { ...start };
    apply(start, { type: "STATUS_CHANGED", actorType: "ANALYST", at: sp("2026-11-09T11:00"), toStatus: "RESOLVED" });
    assert.deepEqual(start, snapshot);
  });

  describe("REOPENED", () => {
    const resolvedAt = sp("2026-11-09T11:00");
    const resolved = apply(created(), { type: "STATUS_CHANGED", actorType: "ANALYST", at: resolvedAt, toStatus: "RESOLVED" }).next;

    it("dentro de 7 dias volta para WAITING_ANALYST com nova janela", () => {
      const at = new Date(resolvedAt.getTime() + REOPEN_WINDOW_MS);
      const r = apply(resolved, { type: "REOPENED", actorType: "EMPLOYEE", at });
      assert.equal(r.next.status, "WAITING_ANALYST");
      assert.equal(r.fromStatus, "RESOLVED");
      assert.equal(r.next.resolvedAt, null);
      assert.deepEqual(r.next.slaStartedAt, at);
      assert.deepEqual(r.next.dueAt, computeDueAt("HIGH", at));
      assert.deepEqual(r.eventDueAt, r.next.dueAt);
    });

    it("depois de 7 dias é proibido", () => {
      const at = new Date(resolvedAt.getTime() + REOPEN_WINDOW_MS + 1);
      assert.throws(() => apply(resolved, { type: "REOPENED", actorType: "EMPLOYEE", at }), InvalidTicketTransitionError);
    });

    it("chamado aberto não pode ser reaberto", () => {
      assert.throws(
        () => apply(created(), { type: "REOPENED", actorType: "EMPLOYEE", at: sp("2026-11-09T12:00") }),
        InvalidTicketTransitionError,
      );
    });

    it("só o funcionário reabre", () => {
      assert.throws(
        () => apply(resolved, { type: "REOPENED", actorType: "ANALYST", at: sp("2026-11-09T12:00") }),
        InvalidTicketTransitionError,
      );
    });
  });
});

describe("canReopen", () => {
  const resolvedAt = sp("2026-11-01T10:00");

  it("true até exatamente 7 dias", () => {
    assert.equal(REOPEN_WINDOW_MS, 7 * DAY_MS);
    assert.equal(canReopen({ status: "RESOLVED", resolvedAt }, new Date(resolvedAt.getTime() + 7 * DAY_MS)), true);
  });

  it("false depois de 7 dias", () => {
    assert.equal(canReopen({ status: "RESOLVED", resolvedAt }, new Date(resolvedAt.getTime() + 7 * DAY_MS + 1)), false);
  });

  it("false se não está resolvido", () => {
    assert.equal(canReopen({ status: "IN_PROGRESS", resolvedAt: null }, resolvedAt), false);
  });
});
