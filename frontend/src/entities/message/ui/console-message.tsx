import { CheckCheck } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { StatusBadge } from "@/shared/ui/status-badge";
import type { ConsoleTimelineItem } from "../lib/console-timeline";

interface ConsoleMessageProps {
  message: Extract<ConsoleTimelineItem, { kind: "message" }>;
  /** Tick de lida: sem dado no backend, fica desligado. */
  read?: boolean;
}

const BUBBLE = {
  client: "w-full rounded-lg rounded-tl-xs bg-paper",
  agent: "max-w-full rounded-lg rounded-tr-xs bg-bubble-agent",
  analyst: "max-w-full rounded-lg rounded-tr-xs bg-bubble-analyst",
} as const;

export function ConsoleMessage({ message, read = false }: ConsoleMessageProps) {
  const { from, senderName, showSender, grouped, text, time, dateTime, long } =
    message;
  const isClient = from === "client";

  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        grouped ? "pt-0.5" : "pt-4",
        isClient ? "items-stretch" : "items-end",
      )}
    >
      {showSender && !isClient ? (
        <div aria-hidden="true" className="flex items-center gap-1.5 px-1">
          <span className="text-caption-strong text-ink-2">{senderName}</span>
          {from === "agent" ? (
            <StatusBadge variant="tag" tone="info">
              IA
            </StatusBadge>
          ) : (
            <StatusBadge variant="tag" tone="success">
              Analista
            </StatusBadge>
          )}
        </div>
      ) : null}
      <div
        className={cn(
          "flex flex-wrap items-end gap-x-2.5 gap-y-0.5 px-3 pt-2 pb-1.5 shadow-bubble",
          BUBBLE[from],
          long && !isClient && "w-105 max-w-full flex-col items-stretch",
        )}
      >
        <p className="text-body wrap-anywhere whitespace-pre-line text-ink">
          <span className="sr-only">{senderName}: </span>
          {text}
        </p>
        <span
          className={cn(
            "inline-flex items-center gap-0.75 pb-px text-time text-ink-3",
            long && !isClient && "ml-auto",
          )}
        >
          <time dateTime={dateTime}>{time}</time>
          {read ? (
            <CheckCheck aria-hidden="true" size={14} className="text-info" />
          ) : null}
        </span>
      </div>
    </div>
  );
}
