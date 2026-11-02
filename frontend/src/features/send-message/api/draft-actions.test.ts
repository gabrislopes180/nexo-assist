import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelDraft, confirmDraft } from "./draft-actions";

const message = {
  id: "m",
  content: "Pronto.",
  createdAt: "2026-10-20T12:00:00.000Z",
  trace: { actions: [] },
};

const ticket = {
  code: "INC-20311",
  type: "INC",
  category: "NETWORK_VPN",
  priority: "HIGH",
  status: "WAITING_ANALYST",
  statusLabel: "Aguardando analista",
  title: "VPN",
  createdAt: "2026-10-20T12:00:00.000Z",
  dueAt: "2026-10-20T16:00:00.000Z",
  overdue: false,
};

function stubFetch(body: unknown) {
  const fetchMock = vi.fn(
    async () => new Response(JSON.stringify(body), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ações de rascunho", () => {
  it("confirma com o corpo informado e devolve mensagem e chamado", async () => {
    const fetchMock = stubFetch({ message, ticket });

    const result = await confirmDraft("d/1", {
      kind: "COMPLEMENT",
      content: "Texto",
    });

    expect(result.ticket.code).toBe("INC-20311");
    expect(fetchMock.mock.calls[0]).toMatchObject([
      "/api/chat/drafts/d%2F1/confirm",
      { method: "POST", body: '{"kind":"COMPLEMENT","content":"Texto"}' },
    ]);
  });

  it("cancela sem corpo", async () => {
    const fetchMock = stubFetch({ message });

    const result = await cancelDraft("d1");

    expect(result.message.content).toBe("Pronto.");
    expect(fetchMock.mock.calls[0]).toMatchObject([
      "/api/chat/drafts/d1/cancel",
      { method: "POST", body: undefined },
    ]);
  });
});
