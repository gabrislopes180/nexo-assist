import { cn } from "@/shared/lib/utils";
import { statusDotClass } from "@/shared/ui/status-badge";
import type { TicketCardField } from "../lib/ticket-card-fields";

interface TicketFieldsProps {
  fields: TicketCardField[];
}

/** Grade abaixo da linha `rule`, comum ao chamado e ao rascunho. */
export function TicketFields({ fields }: TicketFieldsProps) {
  return (
    <div className="px-4.5 pb-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-rule pt-3 md:flex md:gap-6">
        {fields.map(({ label, value, dot, tone, note }) => (
          <div
            key={label}
            className={cn(
              "flex min-w-0 flex-col gap-1 md:flex-1",
              // Em quatro colunas iguais, a nota quebraria; em três, cabe.
              note && fields.length > 3 && "xl:flex-none",
            )}
          >
            <dt className="text-caption text-ink-3">{label}</dt>
            <dd className="flex flex-wrap items-center gap-x-1.5 text-body-strong text-ink xl:flex-nowrap">
              {dot ? (
                <span
                  aria-hidden="true"
                  className={cn("size-1.5 rounded-pill", statusDotClass(dot))}
                />
              ) : null}
              <span className={cn(tone === "warning" && "text-warning-text")}>
                {value}
              </span>
              {note ? (
                <span className="text-small text-ink-3">{note}</span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
