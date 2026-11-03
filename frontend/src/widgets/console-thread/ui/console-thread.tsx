"use client";

import { useEffect, useRef, useState } from "react";
import {
  consoleActionFailure,
  takeoverBarText,
  useConsoleConversation,
} from "@/entities/conversation";
import {
  buildConsoleTimeline,
  ConsoleMessage,
  SystemEvent,
  useConsoleMessages,
} from "@/entities/message";
import { ApiError } from "@/shared/api/api-error";
import { useReturnToAgent } from "@/features/return-to-agent";
import { useTakeoverConversation } from "@/features/takeover-conversation";
import { getFirstName } from "@/shared/lib/get-first-name";
import { Button } from "@/shared/ui/button";
import { ConsoleComposer } from "@/shared/ui/console-composer";
import { PaneLoading } from "@/shared/ui/pane-loading";
import { PaneMessage } from "@/shared/ui/pane-message";
import { footerState } from "../lib/footer-state";
import { ConsoleThreadHeader } from "./console-thread-header";
import { TakeoverBar } from "./takeover-bar";

const NEAR_BOTTOM_PX = 80;

interface ConsoleThreadProps {
  conversationId: string;
  /** Só abaixo de lg: volta para a lista. */
  onBack?: () => void;
  onClearSelection: () => void;
  showPanelButton: boolean;
  onOpenPanel: () => void;
  now: Date;
}

export function ConsoleThread({
  conversationId,
  onBack,
  onClearSelection,
  showPanelButton,
  onOpenPanel,
  now,
}: ConsoleThreadProps) {
  const detail = useConsoleConversation(conversationId);
  const messages = useConsoleMessages(conversationId);
  const takeover = useTakeoverConversation();
  const giveBack = useReturnToAgent();
  const [actionError, setActionError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const actionRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const lastConversationRef = useRef<string | null>(null);

  const conversation = detail.data;
  const timeline =
    conversation && messages.data
      ? buildConsoleTimeline(messages.data, {
          handoffAt: conversation.handoffAt,
          ownerName: conversation.owner.name,
          now,
        })
      : [];

  // Ao trocar de conversa, vai ao fim; com itens novos, só se estava perto dele.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const switched = lastConversationRef.current !== conversationId;
    lastConversationRef.current = conversationId;
    if (switched || isNearBottomRef.current) {
      scroller.scrollTop = scroller.scrollHeight;
    }
  }, [conversationId, timeline.length]);

  const handleScroll = () => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    isNearBottomRef.current =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <=
      NEAR_BOTTOM_PX;
  };

  if (!conversation) {
    if (detail.isPending)
      return (
        <ThreadShell>
          <PaneLoading label="Carregando conversa…" />
        </ThreadShell>
      );
    const notFound =
      detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <ThreadShell>
        <PaneMessage
          tone={notFound ? "muted" : "error"}
          action={
            notFound ? (
              <Button variant="ghost" onClick={onClearSelection}>
                Voltar para a lista
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => void detail.refetch()}>
                Tentar de novo
              </Button>
            )
          }
        >
          {notFound
            ? "Conversa não encontrada."
            : "Não foi possível carregar esta conversa."}
        </PaneMessage>
      </ThreadShell>
    );
  }

  const firstName = getFirstName(conversation.owner.name);
  const footer = footerState(conversation);
  const pending = takeover.isPending
    ? "takeover"
    : giveBack.isPending
      ? "return"
      : null;

  // A ref barra o duplo clique antes do próximo render, como no chat.
  const runAction = (action: "takeover" | "return") => {
    if (actionRef.current) return;
    actionRef.current = true;
    setActionError(null);
    const mutation = action === "takeover" ? takeover : giveBack;
    mutation.mutate(conversation.id, {
      onSuccess: () =>
        setAnnouncement(
          action === "takeover"
            ? `Você assumiu o atendimento de ${firstName}.`
            : "Conversa devolvida ao agent.",
        ),
      onError: (error) =>
        setActionError(consoleActionFailure(error, action).message),
      onSettled: () => {
        actionRef.current = false;
      },
    });
  };

  const body = () => {
    if (messages.isPending)
      return <PaneLoading label="Carregando mensagens…" />;
    if (messages.isError && !messages.data) {
      return (
        <PaneMessage
          tone="error"
          action={
            <Button variant="secondary" onClick={() => void messages.refetch()}>
              Tentar de novo
            </Button>
          }
        >
          Não foi possível carregar as mensagens.
        </PaneMessage>
      );
    }
    if (timeline.length === 0) {
      return <PaneMessage>Nenhuma mensagem nesta conversa.</PaneMessage>;
    }
    return timeline.map((item) => {
      if (item.kind === "day") {
        return (
          <SystemEvent key={item.key} variant="day">
            {item.label}
          </SystemEvent>
        );
      }
      if (item.kind === "event") {
        return (
          <SystemEvent key={item.key} icon={item.icon} className="pt-4">
            {item.label}
          </SystemEvent>
        );
      }
      return <ConsoleMessage key={item.key} message={item} />;
    });
  };

  return (
    <ThreadShell label={`Conversa com ${conversation.owner.name}`}>
      <ConsoleThreadHeader
        conversation={conversation}
        onBack={onBack}
        showPanelButton={showPanelButton}
        onOpenPanel={onOpenPanel}
      />
      <div
        ref={scrollRef}
        role="log"
        aria-label="Histórico da conversa"
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 md:px-10"
      >
        <div className="flex min-h-full flex-col justify-end">{body()}</div>
      </div>
      {footer.kind === "takeover" ? (
        <TakeoverBar
          {...takeoverBarText(conversation)}
          pending={pending}
          error={actionError}
          onTakeover={() => runAction("takeover")}
          onReturn={() => runAction("return")}
        />
      ) : (
        <div className="shrink-0 border-t border-rule bg-paper px-5 py-3.5">
          {actionError ? (
            <p role="alert" className="pb-2 text-caption text-danger-text">
              {actionError}
            </p>
          ) : null}
          <ConsoleComposer locked lockedText={footer.text} />
        </div>
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </ThreadShell>
  );
}

function ThreadShell({
  label,
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={label ?? "Conversa"}
      className="flex min-w-0 flex-1 flex-col bg-thread"
    >
      {children}
    </section>
  );
}
