import { cn } from "@/shared/lib/utils";
import { StatusBadge, statusDotClass } from "@/shared/ui/status-badge";
import { ticketCardFields } from "../lib/ticket-card-fields";
import { STATUS_TONES } from "../lib/ticket-labels";
import type { TicketSummary } from "../model/ticket";

interface TicketCardProps {
  ticket: TicketSummary;
}

export function TicketCard({ ticket }: TicketCardProps) {
  return (
    <article className="overflow-hidden rounded-xl border border-line-card bg-paper shadow-card">
      <div className="flex flex-col gap-1.5 px-4.5 pt-4 pb-3.5">
        <div className="flex flex-wrap items-center gap-2 pb-0.5 text-caption text-ink-3">
          <span className="font-medium">Chamado</span>
          <span
            aria-hidden="true"
            className="size-0.75 rounded-pill bg-rule"
          />
          <span>{ticket.code}</span>
          <span className="ml-auto">
            <StatusBadge tone={STATUS_TONES[ticket.status]} strong>
              {ticket.statusLabel}
            </StatusBadge>
          </span>
        </div>
        <h2 className="text-card-title wrap-anywhere text-ink">
          {ticket.title}
        </h2>
      </div>
      <div className="px-4.5 pb-4">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-rule pt-3 md:flex md:gap-6">
          {ticketCardFields(ticket).map(
            ({ label, value, dot, tone, note }) => (
              <div
                key={label}
                className={cn(
                  "flex min-w-0 flex-col gap-1 md:flex-1",
                  // Com a nota, a coluna igual às outras quebraria "prazo vencido".
                  note && "xl:flex-none",
                )}
              >
                <dt className="text-caption text-ink-3">{label}</dt>
                <dd className="flex flex-wrap items-center gap-x-1.5 text-body-strong text-ink xl:flex-nowrap">
                  {dot ? (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-1.5 rounded-pill",
                        statusDotClass(dot),
                      )}
                    />
                  ) : null}
                  <span
                    className={cn(tone === "warning" && "text-warning-text")}
                  >
                    {value}
                  </span>
                  {note ? (
                    <span className="text-small text-ink-3">{note}</span>
                  ) : null}
                </dd>
              </div>
            ),
          )}
        </dl>
      </div>
    </article>
  );
}
