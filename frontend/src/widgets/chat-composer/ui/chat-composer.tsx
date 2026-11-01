"use client";

import { ArrowUp } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { parseChatMessage, type ChatLock } from "@/features/send-message";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

interface ChatComposerProps {
  /** Devolve `false` se recusou o envio; o texto fica no campo. */
  onSend: (text: string) => boolean;
  count: number;
  max: number;
  busy: boolean;
  lock: ChatLock | null;
  onNewConversation: () => void;
}

export function ChatComposer({
  onSend,
  count,
  max,
  busy,
  lock,
  onNewConversation,
}: ChatComposerProps) {
  const [text, setText] = useState("");
  const [isTooLong, setIsTooLong] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef(false);
  const errorId = useId();

  // A rota escondida pelo Next não pode guardar o rascunho de quem saiu.
  useLayoutEffect(
    () => () => {
      setText("");
      setIsTooLong(false);
    },
    [],
  );

  useEffect(() => {
    if (busy || lock || !returnFocusRef.current) return;

    returnFocusRef.current = false;
    inputRef.current?.focus();
  }, [busy, lock]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || lock) return;

    const parsed = parseChatMessage(text);
    if (parsed.status === "too-long") {
      setIsTooLong(true);
      inputRef.current?.focus();
    }
    if (parsed.status !== "ok" || !onSend(parsed.message)) return;

    returnFocusRef.current = document.activeElement === submitRef.current;
    setText("");
    setIsTooLong(false);
  };

  const handleNewConversation = () => {
    returnFocusRef.current = true;
    onNewConversation();
  };

  const isLocked = lock !== null;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
      <div
        className={cn(
          "flex h-(--composer-height) items-center gap-2 rounded-lg border bg-paper pr-1.5 pl-4",
          isTooLong
            ? "border-danger focus-within:border-danger"
            : "border-line-control focus-within:border-cta",
          isLocked && "cursor-not-allowed bg-desk opacity-55",
        )}
      >
        <input
          ref={inputRef}
          type="text"
          name="message"
          aria-label="Mensagem"
          aria-invalid={isTooLong || undefined}
          aria-describedby={isTooLong ? errorId : undefined}
          placeholder={
            isLocked
              ? "Inicie uma nova conversa para continuar"
              : "Escreva para o Nexo…"
          }
          autoComplete="off"
          disabled={isLocked}
          value={isLocked ? "" : text}
          onChange={(event) => {
            setText(event.target.value);
            setIsTooLong(false);
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-3 disabled:cursor-not-allowed"
        />
        <Button
          ref={submitRef}
          type="submit"
          disabled={isLocked}
          aria-disabled={busy || isLocked || undefined}
          aria-busy={busy || undefined}
          className="gap-1.5 rounded-sm px-3 aria-disabled:hover:bg-cta"
        >
          {busy ? null : <ArrowUp aria-hidden="true" size={15} />}
          {busy ? "Enviando" : "Enviar"}
        </Button>
      </div>
      {lock ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <p role="alert" className="text-small text-ink-2">
            {lock.message}
          </p>
          <Button variant="secondary" onClick={handleNewConversation}>
            Iniciar nova conversa
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          {isTooLong ? (
            <p
              id={errorId}
              role="alert"
              className="text-caption text-danger-text"
            >
              Sua mensagem passou do limite de 2.000 caracteres.
            </p>
          ) : null}
          <p className="ml-auto text-caption text-ink-3">
            {count}/{max} mensagens nesta conversa
          </p>
        </div>
      )}
    </form>
  );
}
