import { Bot, CircleCheckBig } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

interface ConsoleThreadActionsProps {
  /** Ação do cabeçalho em andamento. */
  pending: "return" | "close" | null;
  /** Qualquer ação da conversa rodando (inclusive responder): uma por vez. */
  busy: boolean;
  onReturn: () => void;
  onClose: () => void;
  className?: string;
}

/** Devolver ao agent e Encerrar atendimento, quando a conversa é de quem vê a tela. */
export function ConsoleThreadActions({
  pending,
  busy,
  onReturn,
  onClose,
  className,
}: ConsoleThreadActionsProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
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
        variant="danger"
        aria-disabled={busy || undefined}
        aria-busy={pending === "close" || undefined}
        onClick={() => {
          if (!busy) onClose();
        }}
      >
        <CircleCheckBig aria-hidden="true" size={15} />
        {pending === "close" ? "Encerrando" : "Encerrar atendimento"}
      </Button>
    </div>
  );
}
