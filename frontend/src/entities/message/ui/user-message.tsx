import type { ReactNode } from "react";

interface UserMessageProps {
  children: ReactNode;
  /** Abaixo da bolha, alinhado à direita: linha de falha do envio. */
  footer?: ReactNode;
}

export function UserMessage({ children, footer }: UserMessageProps) {
  return (
    <div className="flex justify-end">
      <div className="flex max-w-full min-w-0 flex-col items-end gap-1.5">
        <div className="max-w-(--user-bubble-width) rounded-lg rounded-br-xs bg-ink px-4 py-2.75 text-body wrap-anywhere whitespace-pre-wrap text-on-ink">
          {children}
        </div>
        {footer}
      </div>
    </div>
  );
}
