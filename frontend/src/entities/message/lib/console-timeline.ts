import { formatDayLabel, formatTime } from "@/shared/lib/format-date";
import type { ConsoleMessageData } from "../model/console-message";
import { systemEventIcon, type SystemEventIcon } from "./system-event-icon";

export type ConsoleTimelineItem =
  | { kind: "day"; key: string; label: string }
  | {
      kind: "message";
      key: string;
      from: "client" | "agent" | "analyst";
      senderName: string;
      showSender: boolean;
      grouped: boolean;
      text: string;
      time: string;
      dateTime: string;
      long: boolean;
    }
  | { kind: "event"; key: string; icon: SystemEventIcon | null; label: string };

const FROM = {
  EMPLOYEE: "client",
  AGENT: "agent",
  ANALYST: "analyst",
} as const;
const LONG_AT = 64;

const dayKey = (iso: string) => new Date(iso).toDateString();

export function buildConsoleTimeline(
  messages: ConsoleMessageData[],
  { ownerName, now }: { ownerName: string; now: Date },
): ConsoleTimelineItem[] {
  // sort é estável: mensagens no mesmo instante mantêm a ordem recebida.
  const sorted = [...messages].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
  const items: ConsoleTimelineItem[] = [];
  let currentDay: string | null = null;
  let previous: ConsoleMessageData | null = null;

  for (const message of sorted) {
    const day = dayKey(message.createdAt);
    if (day !== currentDay) {
      currentDay = day;
      previous = null;
      items.push({
        kind: "day",
        key: `day-${message.id}`,
        label: formatDayLabel(message.createdAt, now),
      });
    }

    if (message.authorType === "SYSTEM") {
      items.push({
        kind: "event",
        key: message.id,
        icon: systemEventIcon(message.systemKind),
        label: `${message.content} · ${formatTime(message.createdAt)}`,
      });
      previous = message;
      continue;
    }

    const from = FROM[message.authorType];
    const grouped =
      previous !== null &&
      previous.authorType === message.authorType &&
      previous.author?.id === message.author?.id;
    items.push({
      kind: "message",
      key: message.id,
      from,
      senderName:
        from === "client"
          ? ownerName
          : from === "agent"
            ? "Nexo Assist"
            : (message.author?.name ?? "Analista"),
      // O cliente nunca mostra o nome visível; o leitor de tela recebe o sr-only.
      showSender: from !== "client" && !grouped,
      grouped,
      text: message.content,
      time: formatTime(message.createdAt),
      dateTime: message.createdAt,
      long: message.content.length > LONG_AT || message.content.includes("\n"),
    });
    previous = message;
  }
  return items;
}
