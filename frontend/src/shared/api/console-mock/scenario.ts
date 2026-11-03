// PROVISÓRIO: remover quando o backend expuser /console (ver plano do console)

const SCENARIOS = [
  "default",
  "slow",
  "empty",
  "error",
  "full",
  "conflict",
] as const;

export type MockScenario = (typeof SCENARIOS)[number];

function isScenario(value: string | null): value is MockScenario {
  return SCENARIOS.some((scenario) => scenario === value);
}

/** `?mock=slow` etc.; qualquer outro valor vira `default`. */
export function parseMockScenario(search: string): MockScenario {
  const value = new URLSearchParams(search).get("mock");
  return isScenario(value) ? value : "default";
}

export function currentMockScenario(): MockScenario {
  return typeof window === "undefined"
    ? "default"
    : parseMockScenario(window.location.search);
}
