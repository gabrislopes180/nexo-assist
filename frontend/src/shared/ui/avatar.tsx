import { cn } from "@/shared/lib/utils";

const TONE_CLASSES = {
  self: "bg-info-soft text-info-text",
  blue: "bg-avatar-blue-bg text-avatar-blue-fg",
  orange: "bg-avatar-orange-bg text-avatar-orange-fg",
  violet: "bg-avatar-violet-bg text-avatar-violet-fg",
  green: "bg-avatar-green-bg text-avatar-green-fg",
  rose: "bg-avatar-rose-bg text-avatar-rose-fg",
  yellow: "bg-avatar-yellow-bg text-avatar-yellow-fg",
  gray: "bg-avatar-gray-bg text-avatar-gray-fg",
} as const;

// 34 mantém o estilo da sidebar; os outros seguem o protótipo do console.
const SIZE_CLASSES = {
  34: "size-8.5 text-label-strong",
  36: "size-9 text-caption font-bold",
  40: "size-10 text-body font-semibold",
  46: "size-11.5 text-heading",
} as const;

interface AvatarProps {
  initials: string;
  name: string;
  tone?: keyof typeof TONE_CLASSES;
  size?: keyof typeof SIZE_CLASSES;
  /** Ponto de presença; o anel acompanha o fundo onde o avatar está. */
  online?: boolean;
  ring?: "paper" | "desk";
}

export function Avatar({
  initials,
  name,
  tone = "self",
  size = 34,
  online = false,
  ring = "paper",
}: AvatarProps) {
  return (
    <span
      role="img"
      aria-label={online ? `${name}, online` : name}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-pill",
        TONE_CLASSES[tone],
        SIZE_CLASSES[size],
      )}
    >
      {initials}
      {online ? (
        <span
          aria-hidden="true"
          className={cn(
            "absolute right-0 bottom-0 rounded-pill bg-success ring-2",
            size === 46 ? "size-2.75" : "size-2.5",
            ring === "desk" ? "ring-desk" : "ring-paper",
          )}
        />
      ) : null}
    </span>
  );
}
