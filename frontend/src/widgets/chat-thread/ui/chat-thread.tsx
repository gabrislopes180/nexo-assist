"use client";

import { useEffect, useRef, useState } from "react";
import {
  AgentMessage,
  AgentWaiting,
  QuickReplies,
  SystemEvent,
  UserMessage,
} from "@/entities/message";
import {
  TicketCard,
  TicketDraftCard,
  TicketSelector,
  type DraftValues,
  type TicketLookup,
  type TicketSummary,
} from "@/entities/ticket";
import type { ChatItem, DraftOp } from "@/features/send-message";
import { Button } from "@/shared/ui/button";

const WAITING_TEXT = "Analisando seu pedido…";
const SLOW_WAITING_TEXT = "Ainda estou trabalhando nisso…";
const SLOW_WAITING_AFTER_MS = 10_000;
const NEAR_BOTTOM_PX = 80;

interface ChatThreadProps {
  items: ChatItem[];
  isPending: boolean;
  lockedOut: boolean;
  /** No limite de mensagens, o rascunho ainda pode ser confirmado. */
  draftsLocked: boolean;
  onRetry: () => void;
  onSelectTicket: (agentItemId: string, ticket: TicketSummary) => void;
  onSelectReply: (agentItemId: string, text: string) => void;
  draftOp: DraftOp | null;
  onConfirmDraft: (agentItemId: string) => void;
  onCancelDraft: (agentItemId: string) => void;
  onRetryDraft: (agentItemId: string) => void;
  onEditDraft: (agentItemId: string, values: DraftValues) => void;
}

function lookupAttachment(
  lookup: TicketLookup | null,
  selectedCode: string | null,
  interactive: boolean,
  onSelect: (ticket: TicketSummary) => void,
) {
  if (lookup?.outcome === "SINGLE_MATCH") {
    return <TicketCard ticket={lookup.tickets[0]} />;
  }
  if (lookup?.outcome === "MULTIPLE_MATCHES") {
    return (
      <TicketSelector
        tickets={lookup.tickets}
        totalMatches={lookup.totalMatches}
        selectedCode={selectedCode}
        interactive={interactive}
        onSelect={onSelect}
      />
    );
  }
  return undefined;
}

export function ChatThread({
  items,
  isPending,
  lockedOut,
  draftsLocked,
  onRetry,
  onSelectTicket,
  onSelectReply,
  draftOp,
  onConfirmDraft,
  onCancelDraft,
  onRetryDraft,
  onEditDraft,
}: ChatThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const lastScrollTopRef = useRef(0);
  const previousLengthRef = useRef(0);
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    if (!isPending) return;

    const timer = setTimeout(() => setIsSlow(true), SLOW_WAITING_AFTER_MS);
    return () => {
      clearTimeout(timer);
      setIsSlow(false);
    };
  }, [isPending]);

  useEffect(() => {
    const scroller = scrollRef.current;
    const previousLength = previousLengthRef.current;
    previousLengthRef.current = items.length;
    if (!scroller) return;

    if (items.length === 0) {
      isNearBottomRef.current = true;
      return;
    }
    const isNewUserTurn =
      items.length > previousLength && items.at(-1)?.kind === "user";
    if (!isNewUserTurn && !isNearBottomRef.current) return;

    isNearBottomRef.current = true;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    scroller.scrollTo({
      top: scroller.scrollHeight,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [items, isPending]);

  const handleScroll = () => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    const { scrollTop, scrollHeight, clientHeight } = scroller;
    const isNear = scrollHeight - scrollTop - clientHeight <= NEAR_BOTTOM_PX;
    const movedUp = scrollTop < lastScrollTopRef.current;
    lastScrollTopRef.current = scrollTop;

    // Descendo, só pode virar "perto": a rolagem suave do envio passa longe do
    // fim, e isso não pode perder uma resposta que chegue no meio dela.
    if (movedUp || isNear) isNearBottomRef.current = isNear;
  };

  const waitingText = isSlow ? SLOW_WAITING_TEXT : WAITING_TEXT;
  const lastItem = items.at(-1);

  return (
    <div
      ref={scrollRef}
      role="region"
      aria-label="Conversa"
      tabIndex={0}
      onScroll={handleScroll}
      className="min-h-0 flex-1 overflow-y-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cta"
    >
      <div className="flex min-h-full flex-col px-4 xl:px-(--chat-gutter)">
        <div className="mt-auto flex flex-col gap-5 pt-7 pb-3.5">
          <div role="log" className="flex flex-col gap-5">
            {items.map((item) => {
              const isLast = item === lastItem;

              if (item.kind === "user") {
                const canRetry =
                  isLast &&
                  item.failure?.retryable === true &&
                  !isPending &&
                  !lockedOut;
                return (
                  <UserMessage
                    key={item.id}
                    footer={
                      item.failure ? (
                        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                          <p className="text-caption text-danger-text">
                            {item.failure.line}
                          </p>
                          {canRetry ? (
                            <Button
                              variant="secondary"
                              onClick={() => {
                                onRetry();
                                // O botão sai da tela: o foco não pode ir ao body.
                                scrollRef.current?.focus();
                              }}
                            >
                              Tentar de novo
                            </Button>
                          ) : null}
                        </div>
                      ) : undefined
                    }
                  >
                    {item.text}
                  </UserMessage>
                );
              }

              if (item.kind === "event") {
                return (
                  <SystemEvent key={item.id} at={item.at} icon="transfer">
                    {item.text}
                  </SystemEvent>
                );
              }

              // Turno ou ação de rascunho em andamento: nada mais é clicável.
              const isIdle = !isPending && draftOp === null && !lockedOut;
              const canAnswer = isLast && isIdle;
              const { draft } = item;
              const attachment = draft ? (
                <TicketDraftCard
                  draft={draft.data}
                  values={draft.values}
                  status={draft.status}
                  failureLine={draft.failure?.line ?? null}
                  canRetry={draft.failure?.retryable === true}
                  interactive={!isPending && draftOp === null && !draftsLocked}
                  busyAction={
                    draftOp?.itemId === item.id ? draftOp.action : null
                  }
                  onConfirm={() => onConfirmDraft(item.id)}
                  onCancel={() => onCancelDraft(item.id)}
                  onRetry={() => onRetryDraft(item.id)}
                  onSave={(values) => onEditDraft(item.id, values)}
                />
              ) : item.ticket ? (
                <TicketCard ticket={item.ticket} />
              ) : (
                lookupAttachment(
                  item.lookup,
                  item.selectedCode,
                  canAnswer && item.selectedCode === null,
                  (ticket) => onSelectTicket(item.id, ticket),
                )
              );
              return (
                <AgentMessage
                  key={item.id}
                  steps={item.steps}
                  replies={
                    item.quickReplies ? (
                      <QuickReplies
                        options={item.quickReplies}
                        selected={item.selectedReply}
                        interactive={canAnswer && item.selectedReply === null}
                        onSelect={(text) => onSelectReply(item.id, text)}
                      />
                    ) : undefined
                  }
                  attachment={attachment}
                >
                  {item.content}
                </AgentMessage>
              );
            })}
          </div>
          {isPending ? <AgentWaiting>{waitingText}</AgentWaiting> : null}
        </div>
      </div>
      <p role="status" className="sr-only">
        {isPending ? waitingText : ""}
      </p>
    </div>
  );
}
