import type { AgentAction } from "../model/message";

export interface TrailStep {
  label: string;
  failed: boolean;
}

type StepsByStatus = Partial<Record<AgentAction["status"], TrailStep[]>>;

const done = (...labels: string[]) =>
  labels.map((label) => ({ label, failed: false }));
const failed = (label: string) => [{ label, failed: true }];

// `summary` é texto de log do backend: a trilha só mostra rótulos daqui.
// SKIPPED e tools desconhecidas não aparecem, salvo a validação, que descarta
// o rascunho e precisa ser explicada.
const TOOL_STEPS: Record<string, StepsByStatus> = {
  searchMyOpenTickets: {
    SUCCESS: done("consultou seus chamados"),
    ERROR: failed("não conseguiu consultar seus chamados"),
  },
  searchHelpCenter: {
    SUCCESS: done("buscou na central de ajuda"),
    ERROR: failed("não conseguiu buscar na central de ajuda"),
  },
  draftTicket: {
    SUCCESS: done(
      "classificou a prioridade",
      "consultou o SLA",
      "montou o rascunho",
    ),
    ERROR: failed("não conseguiu montar o rascunho"),
  },
  draftComplement: {
    SUCCESS: done("montou o rascunho"),
    ERROR: failed("não conseguiu montar o rascunho"),
  },
  validateTicketDraft: {
    SKIPPED: failed("não encontrou o chamado"),
    ERROR: failed("não conseguiu verificar o chamado"),
  },
  draftReopen: {
    SUCCESS: done("consultou seus chamados", "montou o rascunho"),
    ERROR: failed("não conseguiu montar o rascunho"),
  },
  createTicket: { SUCCESS: done("criou o chamado") },
  reopenTicket: { SUCCESS: done("reabriu o chamado") },
  addTicketComplement: { SUCCESS: done("registrou o complemento") },
  transferToAnalyst: {
    SUCCESS: done("transferiu para um analista"),
    ERROR: failed("não conseguiu transferir para um analista"),
  },
};

export function trailSteps(actions: readonly AgentAction[]): TrailStep[] {
  const steps = new Map<string, TrailStep>();

  for (const { tool, status } of actions) {
    const mapped = Object.hasOwn(TOOL_STEPS, tool)
      ? (TOOL_STEPS[tool]?.[status] ?? [])
      : [];
    for (const step of mapped) steps.set(`${step.label}|${step.failed}`, step);
  }
  return [...steps.values()];
}
