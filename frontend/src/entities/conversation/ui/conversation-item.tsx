import { avatarToneFor } from "@/shared/lib/avatar-tone";
import { formatListTime } from "@/shared/lib/format-date";
import { getInitials } from "@/shared/lib/get-initials";
import { cn } from "@/shared/lib/utils";
import { Avatar } from "@/shared/ui/avatar";
import { statusDotClass } from "@/shared/ui/status-badge";
import { conversationPreview } from "../lib/conversation-preview";
import { conversationTag } from "../lib/conversation-tag";
import type { ConsoleConversation } from "../model/console-conversation";

interface ConversationItemProps {
  conversation: ConsoleConversation;
  selected: boolean;
  /** Último da lista: sem divisória embaixo. */
  last?: boolean;
  now: Date;
  onSelect: (id: string) => void;
  // Visuais do protótipo sem dado no backend: aceitas, ainda não usadas.
  unread?: number;
  typing?: boolean;
  online?: boolean;
}

const TAG_TEXT = {
  danger: "text-danger-text",
  warning: "text-warning-text",
} as const;

export function ConversationItem({
  conversation,
  selected,
  last = false,
  now,
  onSelect,
  unread,
  typing = false,
  online = false,
}: ConversationItemProps) {
  const { owner } = conversation;
  const tag = conversationTag(conversation);
  const tagText =
    tag.tone === "danger" || tag.tone === "warning"
      ? TAG_TEXT[tag.tone]
      : "text-ink-3";

  return (
    <button
      type="button"
      aria-current={selected || undefined}
      onClick={() => onSelect(conversation.id)}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 rounded-lg p-2.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cta",
        selected ? "bg-desk" : "hover:bg-desk",
      )}
    >
      <Avatar
        size={46}
        initials={getInitials(owner.name)}
        name={owner.name}
        tone={avatarToneFor(owner.id)}
        online={online}
        ring={selected ? "desk" : "paper"}
      />
      <span
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-0.75 border-b pb-2.5",
          selected || last ? "border-transparent" : "border-rule",
        )}
      >
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-heading font-medium text-ink">
            {owner.name}
          </span>
          <span className="shrink-0 text-caption text-ink-3">
            {formatListTime(conversation.lastMessageAt, now)}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-small leading-normal text-ink-3">
            {typing ? "digitando…" : conversationPreview(conversation)}
          </span>
          {unread ? (
            <span className="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-pill bg-cta px-1 text-badge text-on-ink">
              {unread}
            </span>
          ) : null}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1.25 text-micro",
            tagText,
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "size-1.5 shrink-0 rounded-pill",
              tag.tone === "resolved"
                ? "bg-dot-resolved"
                : statusDotClass(tag.tone),
            )}
          />
          {tag.label}
        </span>
      </span>
    </button>
  );
}
