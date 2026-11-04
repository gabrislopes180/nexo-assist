"use client";

import { useEffect, useRef } from "react";
import {
  TicketDetail,
  TicketHistory,
  useConsoleTicket,
} from "@/entities/ticket";
import { StatusChangeForm } from "@/features/change-ticket-status";
import { ApiError } from "@/shared/api/api-error";
import { Button } from "@/shared/ui/button";
import { PaneLoading } from "@/shared/ui/pane-loading";
import { PaneMessage } from "@/shared/ui/pane-message";

interface TicketDetailViewProps {
  code: string;
  conversationId: string;
  now: Date;
  titleId: string;
  onBack: () => void;
}

export function TicketDetailView({
  code,
  conversationId,
  now,
  titleId,
  onBack,
}: TicketDetailViewProps) {
  const { data, isPending, isError, error, isFetching, refetch } =
    useConsoleTicket(code);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const hasData = data !== undefined;
  const failed = !hasData && isError;

  // Foco no título quando o detalhe aparece, para o leitor de tela começar dele.
  useEffect(() => {
    if (hasData) titleRef.current?.focus();
  }, [hasData]);

  // Sem detalhe, o botão clicado já saiu da tela: o foco vai para "Voltar".
  useEffect(() => {
    if (failed) backRef.current?.focus();
  }, [failed]);

  // Com dado em cache, um refetch com erro não tira o detalhe da tela.
  if (data) {
    return (
      <>
        <TicketDetail
          ticket={data}
          now={now}
          titleId={titleId}
          titleRef={titleRef}
        />
        <StatusChangeForm ticket={data} conversationId={conversationId} />
        <TicketHistory events={data.events} now={now} />
      </>
    );
  }

  if (isPending) return <PaneLoading label="Carregando chamado…" />;

  const notFound = isError && error instanceof ApiError && error.status === 404;
  const back = (
    <Button ref={backRef} variant="ghost" onClick={onBack}>
      Voltar para os chamados
    </Button>
  );

  if (notFound) {
    return (
      <PaneMessage tone="error" action={back}>
        Este chamado não existe mais.
      </PaneMessage>
    );
  }

  return (
    <PaneMessage
      tone="error"
      action={
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <Button
            variant="secondary"
            aria-disabled={isFetching || undefined}
            onClick={() => {
              if (!isFetching) void refetch();
            }}
          >
            Tentar de novo
          </Button>
          {back}
        </div>
      }
    >
      Não foi possível carregar o chamado.
    </PaneMessage>
  );
}
