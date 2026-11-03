import { Bot, Hand, Headset } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { ConsoleComposer } from "@/shared/ui/console-composer";

interface TakeoverBarProps {
  title: string;
  detail: string;
  onReturn: () => void;
  onTakeover: () => void;
  pending: "takeover" | "return" | null;
  error: string | null;
}

export function TakeoverBar({
  title,
  detail,
  onReturn,
  onTakeover,
  pending,
  error,
}: TakeoverBarProps) {
  const busy = pending !== null;

  return (
    <section
      aria-label="Atendimento"
      className="flex shrink-0 flex-col gap-2.5 border-t border-rule bg-paper px-5 pt-3 pb-3.5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-pill bg-warning-soft text-warning-text"
        >
          <Hand size={17} />
        </span>
        <div className="flex min-w-40 flex-1 flex-col gap-0.5">
          <p className="text-body font-semibold text-ink">{title}</p>
          <p className="text-caption text-ink-3">{detail}</p>
        </div>
        <Button
          variant="secondary"
          aria-disabled={busy || undefined}
          aria-busy={pending === "return" || undefined}
          onClick={() => {
            if (!busy) onReturn();
          }}
        >
          <Bot aria-hidden="true" size={15} />
          {pending === "return" ? "Devolvendo" : "Devolver ao agent"}
        </Button>
        <Button
          aria-disabled={busy || undefined}
          aria-busy={pending === "takeover" || undefined}
          onClick={() => {
            if (!busy) onTakeover();
          }}
          className="aria-disabled:hover:bg-cta"
        >
          <Headset aria-hidden="true" size={15} />
          {pending === "takeover" ? "Assumindo" : "Assumir atendimento"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-caption text-danger-text">
          {error}
        </p>
      ) : null}
      <ConsoleComposer locked />
    </section>
  );
}
