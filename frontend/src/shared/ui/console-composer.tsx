"use client";

import { LoaderCircle, SendHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { parseMessageText } from "@/shared/lib/message-text";
import { cn } from "@/shared/lib/utils";

type ConsoleComposerProps =
  | {
      /** A conversa não está com quem vê a tela. */
      locked: true;
      lockedText?: string;
    }
  | {
      locked?: false;
      /** Resolve `true` quando a resposta foi gravada; só então o campo é limpo. */
      onSend: (text: string) => Promise<boolean>;
      busy: boolean;
      placeholder: string;
    };

export function ConsoleComposer(props: ConsoleComposerProps) {
  if (props.locked) {
    return <LockedComposer text={props.lockedText} />;
  }
  return <SendComposer {...props} />;
}

function LockedComposer({
  text = "Assuma o atendimento para responder",
}: {
  text?: string;
}) {
  return (
    <div className="flex h-(--control-lg) items-center rounded-lg bg-desk px-3.5 opacity-55">
      <input
        disabled
        aria-label="Mensagem"
        placeholder={text}
        className="h-full min-w-0 flex-1 cursor-not-allowed bg-transparent text-body text-ink outline-none placeholder:text-ink-3"
      />
      {/* O placeholder some para alguns leitores de tela. */}
      <p className="sr-only">{text}</p>
    </div>
  );
}

function SendComposer({
  onSend,
  busy,
  placeholder,
}: {
  onSend: (text: string) => Promise<boolean>;
  busy: boolean;
  placeholder: string;
}) {
  const [text, setText] = useState("");
  const [isTooLong, setIsTooLong] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef(false);
  const errorId = useId();

  useEffect(() => {
    if (busy || !returnFocusRef.current) return;
    returnFocusRef.current = false;
    inputRef.current?.focus();
  }, [busy]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Ocupado: Enter é recusado sem apagar o que já foi escrito.
    if (busy) return;

    const parsed = parseMessageText(text);
    if (parsed.status === "too-long") {
      setIsTooLong(true);
      inputRef.current?.focus();
      return;
    }
    if (parsed.status !== "ok") return;

    returnFocusRef.current = document.activeElement === submitRef.current;
    if (await onSend(parsed.message)) {
      setText("");
      setIsTooLong(false);
    }
  };

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="flex flex-col gap-1.5"
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-(--control-lg) min-w-0 flex-1 items-center rounded-lg border bg-desk px-3.5",
            isTooLong
              ? "border-danger"
              : "border-transparent focus-within:border-cta",
          )}
        >
          <input
            ref={inputRef}
            type="text"
            name="reply"
            aria-label="Mensagem"
            aria-invalid={isTooLong || undefined}
            aria-describedby={isTooLong ? errorId : undefined}
            placeholder={placeholder}
            autoComplete="off"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setIsTooLong(false);
            }}
            className="h-full min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-3"
          />
        </div>
        <button
          ref={submitRef}
          type="submit"
          aria-label="Enviar"
          aria-disabled={busy || undefined}
          aria-busy={busy || undefined}
          className="inline-flex size-(--control-lg) shrink-0 cursor-pointer items-center justify-center rounded-pill bg-cta text-on-ink transition-colors hover:bg-info-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cta aria-disabled:cursor-not-allowed aria-disabled:hover:bg-cta"
        >
          {busy ? (
            <LoaderCircle
              aria-hidden="true"
              size={18}
              className="motion-safe:animate-spin"
            />
          ) : (
            <SendHorizontal aria-hidden="true" size={18} />
          )}
        </button>
      </div>
      {isTooLong ? (
        <p id={errorId} role="alert" className="text-caption text-danger-text">
          Sua mensagem passou do limite de 2.000 caracteres.
        </p>
      ) : null}
    </form>
  );
}
