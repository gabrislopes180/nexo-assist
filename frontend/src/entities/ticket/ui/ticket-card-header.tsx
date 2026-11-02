import type { ReactNode } from "react";

interface TicketCardHeaderProps {
  kind: string;
  number: string;
  status: ReactNode;
  title: string;
  description?: string;
}

export function TicketCardHeader({
  kind,
  number,
  status,
  title,
  description,
}: TicketCardHeaderProps) {
  return (
    <div className="flex flex-col gap-1.5 px-4.5 pt-4 pb-3.5">
      <div className="flex flex-wrap items-center gap-2 pb-0.5 text-caption text-ink-3">
        <span className="font-medium">{kind}</span>
        <span aria-hidden="true" className="size-0.75 rounded-pill bg-rule" />
        <span>{number}</span>
        <span className="ml-auto">{status}</span>
      </div>
      <h2 className="text-card-title wrap-anywhere text-ink">{title}</h2>
      {description ? (
        <p className="text-small wrap-anywhere whitespace-pre-line text-ink-2">
          {description}
        </p>
      ) : null}
    </div>
  );
}
