import type { AgentAction } from "../model/message";

export interface TrailStep {
  label: string;
  failed: boolean;
}

type StepsByStatus = Partial<Record<AgentAction["status"], TrailStep>>;

// `summary` é texto de log do backend: a trilha só mostra rótulos daqui.
const TOOL_STEPS: Record<string, StepsByStatus> = {
  searchMyOpenTickets: {
    SUCCESS: { label: "consultou seus chamados", failed: false },
    ERROR: { label: "não conseguiu consultar seus chamados", failed: true },
  },
};

export function trailSteps(actions: readonly AgentAction[]): TrailStep[] {
  const steps = new Map<string, TrailStep>();

  for (const { tool, status } of actions) {
    const step = Object.hasOwn(TOOL_STEPS, tool)
      ? TOOL_STEPS[tool]?.[status]
      : undefined;
    if (step) steps.set(`${step.label}|${step.failed}`, step);
  }
  return [...steps.values()];
}
