interface ConsoleComposerProps {
  /** Nesta fase só existe o modo bloqueado. */
  locked: true;
  lockedText?: string;
}

// O modo de envio (botão redondo `size-(--control-lg) rounded-pill bg-cta`,
// com `SendHorizontal` de 18px) entra com a tela 05.
export function ConsoleComposer({
  lockedText = "Assuma o atendimento para responder",
}: ConsoleComposerProps) {
  return (
    <div className="flex h-(--control-lg) items-center rounded-lg bg-desk px-3.5 opacity-55">
      <input
        disabled
        aria-label="Mensagem"
        placeholder={lockedText}
        className="h-full min-w-0 flex-1 cursor-not-allowed bg-transparent text-body text-ink outline-none placeholder:text-ink-3"
      />
      {/* O placeholder some para alguns leitores de tela. */}
      <p className="sr-only">{lockedText}</p>
    </div>
  );
}
