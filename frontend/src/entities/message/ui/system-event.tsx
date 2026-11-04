import { ArrowRightLeft, Bot, Headset, type LucideIcon } from "lucide-react";
import { formatTime } from "@/shared/lib/format-date";
import { cn } from "@/shared/lib/utils";
import type { SystemEventIcon } from "../lib/system-event-icon";

const ICONS = {
  transfer: ArrowRightLeft,
  takeover: Headset,
  return: Bot,
} satisfies Record<SystemEventIcon, LucideIcon>;

interface SystemEventProps {
  children: string;
  /** `day` é a pílula de data ("Hoje"); `event`, a linha com o marco. */
  variant?: "event" | "day";
  /** Horário do marco, em ISO; vira "· 14:20". */
  at?: string;
  icon?: SystemEventIcon | null;
  className?: string;
}

/** Marco no meio da conversa: troca de quem atende, ou o dia. */
export function SystemEvent({
  children,
  variant = "event",
  at,
  icon,
  className,
}: SystemEventProps) {
  if (variant === "day") {
    return (
      <div className={cn("flex justify-center pb-1", className)}>
        <span className="rounded-pill bg-day-pill px-2.5 py-1 text-caption font-medium text-ink-3">
          {children}
        </span>
      </div>
    );
  }

  const Icon = icon ? ICONS[icon] : null;
  return (
    <div role="note" className={cn("flex items-center gap-3", className)}>
      <span aria-hidden="true" className="h-px flex-1 bg-line-thread" />
      <span className="inline-flex min-w-0 items-center gap-1.5 text-center text-caption font-medium text-ink-3">
        {Icon ? (
          <Icon aria-hidden="true" size={13} className="shrink-0" />
        ) : null}
        <span>
          {children}
          {at ? ` · ${formatTime(at)}` : null}
        </span>
      </span>
      <span aria-hidden="true" className="h-px flex-1 bg-line-thread" />
    </div>
  );
}
