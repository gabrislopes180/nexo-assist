"use client";

import { X } from "lucide-react";
import {
  conversationTicketEvent,
  type ConsoleConversation,
} from "@/entities/conversation";
import {
  CurrentTicket,
  sortOtherTickets,
  ticketCountsLabel,
  TicketListItem,
  useConversationTickets,
} from "@/entities/ticket";
import { getFirstName } from "@/shared/lib/get-first-name";
import { Button } from "@/shared/ui/button";
import { PaneLoading } from "@/shared/ui/pane-loading";
import { PaneMessage } from "@/shared/ui/pane-message";

interface TicketPanelProps {
  conversation: ConsoleConversation;
  onClose: () => void;
}

export function TicketPanel({ conversation, onClose }: TicketPanelProps) {
  const firstName = getFirstName(conversation.owner.name);
  const { data, isPending, isError, isFetching, refetch } =
    useConversationTickets(conversation.id);
  const all = data
    ? [
        ...(data.conversationTicket ? [data.conversationTicket] : []),
        ...data.otherTickets,
      ]
    : [];

  const body = () => {
    if (isPending) return <PaneLoading label="Carregando chamados…" />;
    if (isError || !data) {
      return (
        <PaneMessage
          tone="error"
          action={
            <Button
              variant="secondary"
              aria-disabled={isFetching || undefined}
              onClick={() => {
                if (!isFetching) void refetch();
              }}
            >
              Tentar de novo
            </Button>
          }
        >
          Não foi possível carregar os chamados.
        </PaneMessage>
      );
    }
    const others = sortOtherTickets(data.otherTickets);
    return (
      <>
        <section className="flex flex-col gap-3">
          <h3 className="text-caption font-medium text-ink-3">
            Desta conversa
          </h3>
          {data.conversationTicket ? (
            <CurrentTicket
              ticket={data.conversationTicket}
              event={conversationTicketEvent(conversation)}
            />
          ) : (
            <p className="text-small text-ink-3">
              Nenhum chamado ligado a esta conversa.
            </p>
          )}
        </section>
        <section>
          <h3 className="text-caption font-medium text-ink-3">
            Outros chamados
          </h3>
          {others.length > 0 ? (
            <ul>
              {others.map((ticket) => (
                <TicketListItem key={ticket.code} ticket={ticket} />
              ))}
            </ul>
          ) : (
            <p className="pt-3 text-small text-ink-3">
              Nenhum outro chamado de {firstName}.
            </p>
          )}
        </section>
      </>
    );
  };

  return (
    <aside
      aria-labelledby="ticket-panel-title"
      className="flex h-full w-(--panel-width) max-w-full shrink-0 flex-col border-l border-rule bg-paper"
    >
      <div className="flex h-(--topbar-height) shrink-0 items-center gap-3 border-b border-rule px-5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2
            id="ticket-panel-title"
            className="truncate text-heading text-ink"
          >
            Chamados de {firstName}
          </h2>
          {data ? (
            <p className="text-caption text-ink-3">{ticketCountsLabel(all)}</p>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Fechar chamados"
          onClick={onClose}
          className="ml-auto inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-2 hover:bg-desk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cta"
        >
          <X aria-hidden="true" size={18} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto px-5 pt-6 pb-6">
        {body()}
      </div>
    </aside>
  );
}
