"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { formatShortDate } from "@/shared/lib/format-date";
import { cn } from "@/shared/lib/utils";
import { StatusBadge } from "@/shared/ui/status-badge";
import { STATUS_TONES } from "../lib/ticket-labels";
import type { TicketSummary } from "../model/ticket";

interface TicketSelectorProps {
  tickets: TicketSummary[];
  totalMatches: number;
  selectedCode: string | null;
  /** Falso em seletores antigos, com turno pendente ou com o chat bloqueado. */
  interactive: boolean;
  onSelect: (ticket: TicketSummary) => void;
}

function nextFocusIndex(key: string, index: number, count: number) {
  switch (key) {
    case "ArrowDown":
    case "ArrowRight":
      return (index + 1) % count;
    case "ArrowUp":
    case "ArrowLeft":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

export function TicketSelector({
  tickets,
  totalMatches,
  selectedCode,
  interactive,
  onSelect,
}: TicketSelectorProps) {
  const rowsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = tickets.findIndex(
    (ticket) => ticket.code === selectedCode,
  );
  const [focusIndex, setFocusIndex] = useState(0);
  const tabStop = selectedIndex >= 0 ? selectedIndex : focusIndex;

  // A escolha gasta cota de mensagens: as setas só movem o foco.
  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const next = nextFocusIndex(event.key, index, tickets.length);
    if (next === null) return;

    event.preventDefault();
    setFocusIndex(next);
    rowsRef.current[next]?.focus();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="radiogroup"
        aria-label="Chamados"
        className="flex flex-col overflow-hidden rounded-xl border border-line-card bg-paper shadow-card"
      >
        {tickets.map((ticket, index) => {
          const isSelected = ticket.code === selectedCode;
          return (
            <button
              key={ticket.code}
              ref={(row) => {
                rowsRef.current[index] = row;
              }}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-disabled={interactive ? undefined : true}
              tabIndex={index === tabStop ? 0 : -1}
              onClick={() => {
                if (interactive) onSelect(ticket);
              }}
              onFocus={() => setFocusIndex(index)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(
                "flex min-h-11.5 w-full items-center gap-3.5 border-t border-rule bg-paper px-4 py-2.5 text-left first:border-t-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cta md:h-11.5 md:py-0",
                interactive ? "cursor-pointer hover:bg-desk" : "cursor-default",
                isSelected && "bg-row-selected",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-4 shrink-0 rounded-pill bg-paper",
                  isSelected
                    ? "border-[5px] border-cta"
                    : "border-[1.5px] border-line-radio",
                )}
              />
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3.5 gap-y-0.5 md:flex-nowrap">
                <span className="shrink-0 text-caption font-medium text-ink-3">
                  {ticket.code}
                </span>
                <span className="min-w-0 flex-1 text-body-strong wrap-anywhere text-ink max-md:order-first max-md:basis-full md:truncate">
                  {ticket.title}
                </span>
                <StatusBadge tone={STATUS_TONES[ticket.status]}>
                  {ticket.statusLabel}
                </StatusBadge>
                <span className="text-caption text-ink-3 md:w-11 md:text-right">
                  {formatShortDate(ticket.createdAt)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {totalMatches > tickets.length ? (
        <p className="px-4 text-caption text-ink-3">
          Mostrando {tickets.length} de {totalMatches} chamados
        </p>
      ) : null}
    </div>
  );
}
