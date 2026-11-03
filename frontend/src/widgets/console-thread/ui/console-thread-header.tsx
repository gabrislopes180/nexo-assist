import { Bot, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import {
  conversationStatusPill,
  type ConsoleConversation,
} from "@/entities/conversation";
import { avatarToneFor } from "@/shared/lib/avatar-tone";
import { getInitials } from "@/shared/lib/get-initials";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { StatusBadge } from "@/shared/ui/status-badge";

interface ConsoleThreadHeaderProps {
  conversation: ConsoleConversation;
  onBack?: () => void;
  showPanelButton: boolean;
  onOpenPanel: () => void;
  /** Ações de quem atende; abaixo de 640 px vão para uma linha embaixo. */
  actions?: ReactNode;
}

export function ConsoleThreadHeader({
  conversation,
  onBack,
  showPanelButton,
  onOpenPanel,
  actions,
}: ConsoleThreadHeaderProps) {
  const { owner } = conversation;
  const pill = conversationStatusPill(conversation);
  const meta = [owner.department, conversation.ticketCode]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
    <header className="flex h-(--topbar-height) shrink-0 items-center gap-3 border-b border-rule bg-paper px-5">
      {onBack ? (
        <Button
          variant="ghost"
          onClick={onBack}
          className="-ml-2 px-2 lg:hidden"
        >
          <ChevronRight aria-hidden="true" size={16} className="rotate-180" />
          Conversas
        </Button>
      ) : null}
      <Avatar
        size={40}
        initials={getInitials(owner.name)}
        name={owner.name}
        tone={avatarToneFor(owner.id)}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 className="truncate text-heading font-medium text-ink">
          {owner.name}
        </h2>
        {meta ? (
          <p className="truncate text-caption text-ink-3">{meta}</p>
        ) : null}
      </div>
      {actions ? (
        // As ações já dizem que a conversa é de quem vê a tela, como no protótipo.
        <div className="shrink-0 max-sm:hidden">{actions}</div>
      ) : (
        <StatusBadge
          variant="pill"
          tone={pill.tone}
          icon={pill.icon === "bot" ? Bot : undefined}
        >
          {pill.label}
        </StatusBadge>
      )}
      {showPanelButton ? (
        <Button variant="secondary" onClick={onOpenPanel}>
          Ver chamados
        </Button>
      ) : null}
    </header>
    {actions ? (
      <div className="flex shrink-0 border-b border-rule bg-paper px-5 py-2.5 sm:hidden">
        {actions}
      </div>
    ) : null}
    </>
  );
}
