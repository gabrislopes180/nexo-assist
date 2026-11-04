import { randomBytes } from "node:crypto";
import type { ConsoleRow } from "../conversations/conversation-queries.js";
import type { TimelineMessage } from "../conversations/timeline.js";
import { describeErrorForLog } from "../shared/safe-error.js";
import { REALTIME_DEFAULTS } from "./config.js";

/**
 * Evento interno, ainda sem público. Cada um carrega o dono da conversa, para o filtro por
 * assinante; a view (chat ou console) é montada só na hora de escrever para cada um.
 */
export type BusEventInput =
  | { type: "message.created"; ownerId: string; conversationId: string; data: TimelineMessage }
  | { type: "conversation.updated"; ownerId: string; conversationId: string; data: ConsoleRow }
  /** Painel de chamados do dono desatualizado; conversationId null quando a mudança não veio de uma conversa. */
  | { type: "tickets.changed"; ownerId: string; conversationId: string | null; ticketCode: string | null; data: null };

export type BusEvent = BusEventInput & { id: string; seq: number };

export type BusSubscriber = {
  filter?: (event: BusEvent) => boolean;
  onEvent: (event: BusEvent) => void;
  /** Chamado por `closeAll` (desligamento do processo). */
  onClose?: () => void;
};

export type EventBus = {
  push(event: BusEventInput): BusEvent;
  subscribe(subscriber: BusSubscriber): () => void;
  /** Eventos depois de `lastEventId`; null quando não dá para garantir a continuidade (reinício, buffer estourado, id inválido). */
  replaySince(lastEventId: string | null | undefined): BusEvent[] | null;
  /** Id do último evento publicado (`<bootId>.0` antes do primeiro). */
  head(): string;
  subscriberCount(): number;
  closeAll(): void;
};

const ID_PATTERN = /^([a-z0-9]+)\.(\d+)$/;
const BOOT_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomBootId(): string {
  return [...randomBytes(6)].map((byte) => BOOT_ALPHABET[byte % BOOT_ALPHABET.length]).join("");
}

/**
 * Barramento em memória, com sequência por processo e ring buffer para replay. Só serve para uma
 * instância da API: em várias, o mesmo contrato precisaria de outbox com sequência global e pub/sub.
 * `push` é síncrono, então inscrever e ler o buffer no mesmo tick não deixa buraco nem duplicata.
 */
export function createEventBus({
  bootId = randomBootId(),
  bufferSize = REALTIME_DEFAULTS.bufferSize,
}: { bootId?: string; bufferSize?: number } = {}): EventBus {
  const buffer: BusEvent[] = [];
  const subscribers = new Set<BusSubscriber>();
  let seq = 0;

  return {
    push(input) {
      seq += 1;
      const event: BusEvent = { ...input, id: `${bootId}.${seq}`, seq };
      buffer.push(event);
      if (buffer.length > bufferSize) buffer.shift();
      for (const subscriber of [...subscribers]) {
        try {
          if (!subscriber.filter || subscriber.filter(event)) subscriber.onEvent(event);
        } catch (error) {
          console.error("Falha ao entregar evento a um assinante:", describeErrorForLog(error));
        }
      }
      return event;
    },

    subscribe(subscriber) {
      subscribers.add(subscriber);
      return () => {
        subscribers.delete(subscriber);
      };
    },

    replaySince(lastEventId) {
      const match = lastEventId ? ID_PATTERN.exec(lastEventId) : null;
      if (!match || match[1] !== bootId) return null;
      const lastSeq = Number(match[2]);
      if (!Number.isSafeInteger(lastSeq) || lastSeq > seq) return null;
      const oldestSeq = buffer[0]?.seq ?? seq + 1;
      if (lastSeq < oldestSeq - 1) return null;
      return buffer.filter((event) => event.seq > lastSeq);
    },

    head: () => `${bootId}.${seq}`,

    subscriberCount: () => subscribers.size,

    closeAll() {
      const current = [...subscribers];
      subscribers.clear();
      for (const subscriber of current) {
        try {
          subscriber.onClose?.();
        } catch (error) {
          console.error("Falha ao encerrar um assinante:", describeErrorForLog(error));
        }
      }
    },
  };
}
