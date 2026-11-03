"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import {
  ConversationItem,
  FILTER_LABELS,
  filterCounts,
  visibleConversations,
  type ConsoleConversation,
  type ConversationFilter,
} from "@/entities/conversation";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { FilterChips } from "@/shared/ui/filter-chips";
import { PaneLoading } from "@/shared/ui/pane-loading";
import { PaneMessage } from "@/shared/ui/pane-message";
import { SearchField } from "@/shared/ui/search-field";

const EMPTY_BY_FILTER: Record<ConversationFilter, string> = {
  all: "Nenhuma conversa por aqui.",
  waiting: "Nenhuma conversa esperando atendente.",
  "with-agent": "O agent não está atendendo ninguém agora.",
  mine: "Você não está atendendo nenhuma conversa.",
};

const FILTERS: ConversationFilter[] = ["all", "waiting", "with-agent", "mine"];

interface ConversationListProps {
  query: UseQueryResult<ConsoleConversation[]>;
  filter: ConversationFilter;
  onFilterChange: (filter: ConversationFilter) => void;
  search: string;
  onSearchChange: (search: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  now: Date;
  className?: string;
}

export function ConversationList({
  query,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  selectedId,
  onSelect,
  now,
  className,
}: ConversationListProps) {
  const { data, isPending, isError, isFetching, refetch } = query;
  const counts = data ? filterCounts(data) : null;
  const visible = data ? visibleConversations(data, filter, search) : [];

  const body = () => {
    if (isPending) return <PaneLoading label="Carregando conversas…" />;
    // Com dados, um refetch que falha mantém a lista sem aviso.
    if (isError && !data) {
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
          Não foi possível carregar as conversas.
        </PaneMessage>
      );
    }
    if (visible.length === 0) {
      return search.trim() ? (
        <PaneMessage
          action={
            <Button variant="ghost" onClick={() => onSearchChange("")}>
              Limpar busca
            </Button>
          }
        >
          Nenhuma conversa encontrada para “{search.trim()}”.
        </PaneMessage>
      ) : (
        <PaneMessage>{EMPTY_BY_FILTER[filter]}</PaneMessage>
      );
    }
    return (
      <ul>
        {visible.map((conversation, index) => (
          <li key={conversation.id}>
            <ConversationItem
              conversation={conversation}
              selected={conversation.id === selectedId}
              last={index === visible.length - 1}
              now={now}
              onSelect={onSelect}
            />
          </li>
        ))}
      </ul>
    );
  };

  return (
    <section
      aria-labelledby="console-title"
      className={cn(
        "flex min-h-0 w-full flex-col border-r border-rule bg-paper lg:w-(--list-width) lg:shrink-0",
        className,
      )}
    >
      <div className="px-4 pt-4">
        <div className="flex h-6.25 items-center">
          <h1 id="console-title" className="text-panel-title text-ink">
            Conversas
          </h1>
        </div>
        <SearchField
          className="mt-3"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        <FilterChips
          className="mt-3"
          label="Filtrar conversas"
          value={filter}
          onChange={onFilterChange}
          items={FILTERS.map((value) => ({
            value,
            label: FILTER_LABELS[value],
            count: value === "all" || !counts ? undefined : counts[value],
          }))}
        />
      </div>
      <div className="mt-2.5 flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-2">
        {body()}
      </div>
    </section>
  );
}
