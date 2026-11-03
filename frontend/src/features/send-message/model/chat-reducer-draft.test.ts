import { describe, expect, it } from "vitest";
import type { TicketDraft, TicketSummary } from "@/entities/ticket";
import {
  chatReducer,
  createInitialChatState,
  type ChatItem,
  type ChatState,
  type DraftFailure,
} from "./chat-reducer";
import type { ChatResponse } from "./chat-schema";

const ticket: TicketSummary = {
  code: "INC-20311",
  type: "INC",
  category: "NETWORK_VPN",
  priority: "HIGH",
  status: "WAITING_ANALYST",
  statusLabel: "Aguardando analista",
  title: "VPN não conecta",
  createdAt: "2026-10-20T12:00:00.000Z",
  dueAt: "2026-10-20T16:00:00.000Z",
  overdue: false,
};

const createDraft = (id = "d1"): TicketDraft => ({
  id,
  kind: "CREATE",
  type: "INC",
  category: "NETWORK_VPN",
  priority: "HIGH",
  title: "VPN não conecta",
  description: "Erro 809.",
  affectedScope: "INDIVIDUAL",
  dueAtPreview: "2026-10-20T16:00:00.000Z",
});

const lookup: ChatResponse["ticketLookup"] = {
  outcome: "MULTIPLE_MATCHES",
  openTicketCount: 2,
  totalMatches: 2,
  tickets: [ticket, { ...ticket, code: "INC-1" }],
};

const turn = (overrides: Partial<ChatResponse> = {}): ChatResponse => ({
  conversation: {
    id: "c1",
    status: "WITH_AGENT",
    messageCount: 1,
    messageLimit: 30,
    remainingMessages: 29,
  },
  message: {
    id: "m",
    content: "Confira antes de eu criar:",
    createdAt: "2026-10-20T12:00:00.000Z",
    trace: { actions: [] },
  },
  ticketLookup: null,
  ticketDraft: null,
  quickReplies: null,
  ...overrides,
});

const agentMessage = (content: string) => ({
  id: "m2",
  content,
  createdAt: "2026-10-20T12:01:00.000Z",
  trace: {
    actions: [
      { tool: "createTicket", summary: "s", status: "SUCCESS" as const },
    ],
  },
});

function exchange(state: ChatState, n: number, result: ChatResponse) {
  const sent = chatReducer(state, { type: "sent", id: `u${n}`, text: "oi" });
  return chatReducer(sent, { type: "succeeded", id: `a${n}`, result });
}

const agentItem = (state: ChatState, id: string) => {
  const item = state.items.find((candidate) => candidate.id === id);
  if (item?.kind !== "agent") throw new Error(`sem item ${id}`);
  return item;
};

const failure = (overrides: Partial<DraftFailure> = {}): DraftFailure => ({
  line: "O serviço de chamados não respondeu agora.",
  retryable: true,
  unavailable: false,
  lock: null,
  sessionExpired: false,
  ...overrides,
});

const withDraft = () =>
  exchange(createInitialChatState(), 1, turn({ ticketDraft: createDraft() }));

describe("chatReducer: rascunhos", () => {
  it("guarda o rascunho pendente com os valores editáveis", () => {
    expect(agentItem(withDraft(), "a1").draft).toEqual({
      data: createDraft(),
      values: {
        kind: "CREATE",
        title: "VPN não conecta",
        description: "Erro 809.",
        affectedScope: "INDIVIDUAL",
      },
      status: "pending",
      failure: null,
      failedAction: null,
    });
  });

  it("mostra só o rascunho quando o turno também traz consulta", () => {
    const state = exchange(
      createInitialChatState(),
      1,
      turn({ ticketDraft: createDraft(), ticketLookup: lookup }),
    );
    expect(agentItem(state, "a1").lookup).toBeNull();
  });

  it("draftEdited troca os valores sem mudar o status", () => {
    const values = {
      kind: "CREATE" as const,
      title: "Novo",
      description: "Desc",
      affectedScope: "TEAM" as const,
    };
    const state = chatReducer(withDraft(), { type: "draftEdited", id: "a1", values });

    expect(agentItem(state, "a1").draft).toMatchObject({ values, status: "pending" });
  });

  it("draftActionStarted marca a operação e limpa falha anterior", () => {
    const failedState = chatReducer(
      chatReducer(withDraft(), { type: "draftActionStarted", id: "a1", action: "confirm" }),
      { type: "draftFailed", failure: failure() },
    );
    const state = chatReducer(failedState, {
      type: "draftActionStarted",
      id: "a1",
      action: "confirm",
    });

    expect(state.draftOp).toEqual({ itemId: "a1", action: "confirm" });
    expect(agentItem(state, "a1").draft?.failure).toBeNull();
  });

  it("draftConfirmed fecha o rascunho e acrescenta a mensagem com o chamado", () => {
    const started = chatReducer(withDraft(), {
      type: "draftActionStarted",
      id: "a1",
      action: "confirm",
    });
    const state = chatReducer(started, {
      type: "draftConfirmed",
      id: "a2",
      result: { message: agentMessage("Pronto, abri o INC-20311."), ticket },
    });

    expect(agentItem(state, "a1").draft?.status).toBe("confirmed");
    expect(state.items.at(-1)).toMatchObject({
      kind: "agent",
      id: "a2",
      content: "Pronto, abri o INC-20311.",
      steps: [{ label: "criou o chamado", failed: false }],
      ticket,
    });
    expect(state.draftOp).toBeNull();
    expect(state.count).toBe(started.count);
  });

  it("draftCancelled fecha o rascunho e acrescenta a mensagem fixa", () => {
    const started = chatReducer(withDraft(), {
      type: "draftActionStarted",
      id: "a1",
      action: "cancel",
    });
    const state = chatReducer(started, {
      type: "draftCancelled",
      id: "a2",
      result: { message: agentMessage("Tudo bem, cancelei.") },
    });

    expect(agentItem(state, "a1").draft?.status).toBe("cancelled");
    expect(state.items.at(-1)).toMatchObject({ content: "Tudo bem, cancelei.", ticket: null });
    expect(state.draftOp).toBeNull();
  });

  it("draftFailed mantém o rascunho pendente e guarda a ação para repetir", () => {
    const started = chatReducer(withDraft(), {
      type: "draftActionStarted",
      id: "a1",
      action: "confirm",
    });
    const state = chatReducer(started, { type: "draftFailed", failure: failure() });

    expect(agentItem(state, "a1").draft).toMatchObject({
      status: "pending",
      failure: failure(),
      failedAction: "confirm",
    });
    expect(state.items).toHaveLength(2);
    expect(state.draftOp).toBeNull();
  });

  it("draftFailed indisponível marca o rascunho como indisponível", () => {
    const started = chatReducer(withDraft(), {
      type: "draftActionStarted",
      id: "a1",
      action: "confirm",
    });
    const state = chatReducer(started, {
      type: "draftFailed",
      failure: failure({ retryable: false, unavailable: true }),
    });

    expect(agentItem(state, "a1").draft?.status).toBe("unavailable");
  });

  it("draftFailed aplica o bloqueio do chat", () => {
    const lock = { message: "Um analista vai continuar o atendimento por aqui." };
    const started = chatReducer(withDraft(), {
      type: "draftActionStarted",
      id: "a1",
      action: "confirm",
    });
    const state = chatReducer(started, {
      type: "draftFailed",
      failure: failure({ retryable: false, lock }),
    });

    expect(state.lock).toEqual(lock);
  });

  it("draftFailed sem operação em andamento não altera o estado", () => {
    const state = withDraft();
    expect(chatReducer(state, { type: "draftFailed", failure: failure() })).toBe(state);
  });

  it("um novo rascunho substitui o anterior", () => {
    const state = exchange(withDraft(), 2, turn({ ticketDraft: createDraft("d2") }));

    expect(agentItem(state, "a1").draft?.status).toBe("superseded");
    expect(agentItem(state, "a2").draft?.status).toBe("pending");
  });

  it("um turno sem rascunho mantém o anterior pendente", () => {
    const state = exchange(withDraft(), 2, turn());
    expect(agentItem(state, "a1").draft?.status).toBe("pending");
  });

  it("guarda as respostas rápidas e marca a escolhida", () => {
    const quickReplies = ["Só eu", "Minha equipe", "Toda a empresa", "Não sei"];
    const state = exchange(createInitialChatState(), 1, turn({ quickReplies }));
    const picked = chatReducer(state, { type: "replySelected", id: "a1", text: "Só eu" });

    expect(agentItem(state, "a1")).toMatchObject({ quickReplies, selectedReply: null });
    expect(agentItem(picked, "a1").selectedReply).toBe("Só eu");
  });

  it("reabertura: guarda o motivo, edita, confirma e trata 409", () => {
    const reopenDraft: TicketDraft = {
      id: "r1",
      kind: "REOPEN",
      ticket: { ...ticket, status: "RESOLVED", statusLabel: "Resolvido", canReopen: true },
      reason: "Voltou a falhar.",
      dueAtPreview: "2026-10-20T16:00:00.000Z",
    };
    const drafted = exchange(createInitialChatState(), 1, turn({ ticketDraft: reopenDraft }));
    expect(agentItem(drafted, "a1").draft?.values).toEqual({
      kind: "REOPEN",
      reason: "Voltou a falhar.",
    });

    const edited = chatReducer(drafted, {
      type: "draftEdited",
      id: "a1",
      values: { kind: "REOPEN", reason: "Senha expira de novo." },
    });
    const started = chatReducer(edited, {
      type: "draftActionStarted",
      id: "a1",
      action: "confirm",
    });

    const blocked = chatReducer(started, {
      type: "draftFailed",
      failure: failure({ retryable: false, unavailable: true }),
    });
    expect(agentItem(blocked, "a1").draft?.status).toBe("unavailable");

    const reopened = chatReducer(started, {
      type: "draftConfirmed",
      id: "a2",
      result: { message: agentMessage("Chamado reaberto."), ticket },
    });
    expect(agentItem(reopened, "a1").draft?.status).toBe("confirmed");
    expect(reopened.items.at(-1)).toMatchObject({ ticket });
  });

  it("transferência no turno: insere o evento uma vez e trava o chat", () => {
    const waiting = (n: number) =>
      turn({
        conversation: {
          id: "c1",
          status: "WAITING_ANALYST",
          messageCount: n,
          messageLimit: 30,
          remainingMessages: 30 - n,
        },
      });
    const once = exchange(createInitialChatState(), 1, waiting(1));
    const events = (state: ChatState) =>
      state.items.filter((item) => item.kind === "event");

    expect(events(once)).toEqual([
      {
        kind: "event",
        id: "a1-transfer",
        text: "Transferida para um analista",
        at: "2026-10-20T12:00:00.000Z",
      },
    ]);
    expect(once.items.at(-1)?.kind).toBe("event");
    expect(once.lock).toEqual({
      message: "Um analista vai continuar o atendimento por aqui.",
    });
    expect(events(exchange(once, 2, waiting(2)))).toHaveLength(1);
  });

  it("transferência na confirmação: trava o chat e insere o evento", () => {
    const started = chatReducer(withDraft(), {
      type: "draftActionStarted",
      id: "a1",
      action: "confirm",
    });
    const state = chatReducer(started, {
      type: "draftConfirmed",
      id: "a2",
      result: {
        message: agentMessage("Abri o INC-20311 e chamei um analista."),
        ticket: { ...ticket, priority: "CRITICAL" },
        conversation: { id: "c1", status: "WAITING_ANALYST" },
      },
    });

    expect(state.items.at(-1)).toMatchObject({
      kind: "event",
      text: "Transferida para um analista",
    });
    expect(state.items.at(-2)).toMatchObject({ kind: "agent", id: "a2" });
    expect(state.lock?.message).toBe(
      "Um analista vai continuar o atendimento por aqui.",
    );
  });

  it("confirmação sem transferência não trava nem insere evento", () => {
    const started = chatReducer(withDraft(), {
      type: "draftActionStarted",
      id: "a1",
      action: "confirm",
    });
    const state = chatReducer(started, {
      type: "draftConfirmed",
      id: "a2",
      result: {
        message: agentMessage("Pronto."),
        ticket,
        conversation: { id: "c1", status: "WITH_AGENT" },
      },
    });

    expect(state.lock).toBeNull();
    expect(state.items.some((item) => item.kind === "event")).toBe(false);
  });

  it("reset limpa a operação de rascunho", () => {
    const started = chatReducer(withDraft(), {
      type: "draftActionStarted",
      id: "a1",
      action: "confirm",
    });
    expect(chatReducer(started, { type: "reset" })).toEqual(createInitialChatState());
  });
});

export type { ChatItem };
