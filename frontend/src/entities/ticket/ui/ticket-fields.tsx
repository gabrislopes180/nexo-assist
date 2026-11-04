import { cn } from "@/shared/lib/utils";
import { statusDotClass } from "@/shared/ui/status-badge";
import type { TicketCardField } from "../lib/ticket-card-fields";

interface TicketFieldsProps {
  fields: TicketCardField[];
  /**
   * `card`: dentro do cartão do chat, em linha a partir de `md`.
   * `panel`: no painel estreito do console, sempre em duas colunas e sem recuo.
   */
  layout?: "card" | "panel";
}

/** Grade abaixo da linha `rule`, comum ao chamado e ao rascunho. */
export function TicketFields({ fields, layout = "card" }: TicketFieldsProps) {
  const isPanel = layout === "panel";
  return (
    <div className={cn(!isPanel && "px-4.5 pb-4")}>
      <dl
        className={cn(
          "grid grid-cols-2 gap-x-6 gap-y-3 border-t border-rule pt-3",
          !isPanel && "md:flex md:gap-6",
        )}
      >
        {fields.map(({ label, value, dot, tone, note, wide }) => (
          <div
            key={label}
            className={cn(
              "flex min-w-0 flex-col gap-1",
              isPanel
                ? wide && "col-span-2"
                : // Em quatro colunas iguais, a nota quebraria; em três, cabe.
                  cn("md:flex-1", note && fields.length > 3 && "xl:flex-none"),
            )}
          >
            <dt className="text-caption text-ink-3">{label}</dt>
            <dd
              className={cn(
                "flex flex-wrap items-center gap-x-1.5 text-body-strong text-ink",
                !isPanel && "xl:flex-nowrap",
              )}
            >
              {dot ? (
                <span
                  aria-hidden="true"
                  className={cn("size-1.5 rounded-pill", statusDotClass(dot))}
                />
              ) : null}
              <span
                className={cn(
                  "wrap-anywhere",
                  tone === "warning" && "text-warning-text",
                )}
              >
                {value}
              </span>
              {note ? (
                <span className="text-small wrap-anywhere text-ink-3">
                  {note}
                </span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
