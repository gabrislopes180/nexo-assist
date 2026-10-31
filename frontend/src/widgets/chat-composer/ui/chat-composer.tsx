"use client";

import { ArrowUp } from "lucide-react";
import { useState } from "react";
import { Button } from "@/shared/ui/button";

export function ChatComposer() {
  const [text, setText] = useState("");

  return (
    <form
      onSubmit={(event) => event.preventDefault()}
      className="flex flex-col gap-1.5"
    >
      <div className="flex h-(--composer-height) items-center gap-2 rounded-lg border border-line-control bg-paper pr-1.5 pl-4 focus-within:border-cta">
        <input
          type="text"
          aria-label="Mensagem"
          placeholder="Escreva para o Nexo…"
          autoComplete="off"
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="h-full min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-3"
        />
        <Button type="submit" className="gap-1.5 rounded-sm px-3">
          <ArrowUp aria-hidden="true" size={15} />
          Enviar
        </Button>
      </div>
      <p className="text-right text-caption text-ink-3">
        0/30 mensagens nesta sessão
      </p>
    </form>
  );
}
