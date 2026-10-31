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

const SIZE_CLASSES = {
  34: "size-8.5",
  36: "size-9",
  40: "size-10",
  46: "size-11.5",
} as const;

interface AvatarProps {
  initials: string;
  name: string;
  tone?: keyof typeof TONE_CLASSES;
  size?: keyof typeof SIZE_CLASSES;
}

export function Avatar({ initials, name, tone = "self", size = 34 }: AvatarProps) {
  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-pill text-label-strong",
        TONE_CLASSES[tone],
        SIZE_CLASSES[size],
      )}
    >
      {initials}
    </span>
  );
}
