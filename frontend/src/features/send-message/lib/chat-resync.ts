import type { ChatConversationDetail } from "../model/chat-schema";

type Context = { conversationId: string | undefined; generation: number; busy: boolean };

/** Um GET por vez; uma leitura anterior a evento/ação nunca substitui o estado mais novo. */
export function createChatResync({ read, current, onSnapshot, onError }: {
  read: (id: string) => Promise<ChatConversationDetail>;
  current: () => Context;
  onSnapshot: (snapshot: ChatConversationDetail) => void;
  onError: (error: unknown) => void;
}) {
  let inFlight = false;
  let revision = 0;
  let queued: { id: string; generation: number } | null = null;

  function resume() {
    if (!queued || inFlight || current().busy) return;
    const next = queued;
    queued = null;
    if (next.generation === current().generation && next.id === current().conversationId) run(next.id);
  }

  function run(id = current().conversationId) {
    if (id === undefined) return;
    const generation = current().generation;
    if (inFlight || current().busy) {
      queued = { id, generation };
      return;
    }
    inFlight = true;
    const startedRevision = revision;
    const stillCurrent = () => current().generation === generation && current().conversationId === id;
    void read(id).then(
      (snapshot) => {
        if (!stillCurrent()) return;
        if (revision !== startedRevision || current().busy) {
          queued = { id, generation };
          return;
        }
        onSnapshot(snapshot);
      },
      (error: unknown) => {
        if (!stillCurrent()) return;
        if (revision !== startedRevision || current().busy) queued = { id, generation };
        else onError(error);
      },
    ).finally(() => {
      inFlight = false;
      resume();
    });
  }

  return { run, resume, invalidate: () => { revision += 1; } };
}
