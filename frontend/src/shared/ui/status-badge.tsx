import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

const TONES = {
  warning: {
    dot: "bg-warning",
    pill: "bg-warning-soft text-warning-text",
    strong: "text-warning-text",
  },
  info: {
    dot: "bg-info",
    pill: "bg-info-soft text-info-text",
    strong: "text-info-text",
  },
  success: {
    dot: "bg-success",
    pill: "bg-success-soft text-success-text",
    strong: "text-success-text",
  },
  danger: {
    dot: "bg-danger",
    pill: "bg-danger-soft text-danger-text",
    strong: "text-danger-text",
  },
  neutral: {
    dot: "bg-dot-neutral",
    pill: "bg-desk text-ink-3",
    strong: "text-ink-3",
  },
  medium: {
    dot: "bg-dot-medium",
    pill: "bg-desk text-ink-3",
    strong: "text-ink-3",
  },
} as const;

interface StatusBadgeProps {
  tone: keyof typeof TONES;
  variant?: "dot" | "pill";
  /** Na variante `dot`, pinta o texto na cor do tom, com peso 500. */
  strong?: boolean;
  children: ReactNode;
}

export function StatusBadge({
  tone,
  variant = "dot",
  strong = false,
  children,
}: StatusBadgeProps) {
  const { dot, pill, strong: strongText } = TONES[tone];
  const isPill = variant === "pill";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap",
        isPill
          ? cn("rounded-pill px-2.5 py-1.25 text-caption-strong", pill)
          : "text-caption text-ink-3",
        !isPill && strong && cn("font-medium", strongText),
      )}
    >
      <span aria-hidden="true" className={cn("size-1.75 rounded-pill", dot)} />
      {children}
    </span>
  );
}
