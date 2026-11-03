// PROVISÓRIO: remover quando o backend expuser /console (ver plano do console)
import { buildConsoleFixtures, type MockState } from "./fixtures";
import type { MockScenario } from "./scenario";

// Estado em memória por cenário; recarregar a página volta ao início.
const databases = new Map<MockScenario, MockState>();

export function mockDb(scenario: MockScenario, now: Date): MockState {
  let state = databases.get(scenario);
  if (!state) {
    state = buildConsoleFixtures(now, scenario);
    databases.set(scenario, state);
  }
  return state;
}

export function resetMockDb(): void {
  databases.clear();
}
