"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useIsMac } from "@/shared/lib/hooks/use-is-mac";
import { Button } from "@/shared/ui/button";
import { StatusBadge, type StatusTone } from "@/shared/ui/status-badge";
import { draftCardFields } from "../lib/ticket-draft-fields";
import type {
  DraftStatus,
  DraftValues,
  TicketDraft,
} from "../model/ticket-draft";
import { TicketCardHeader } from "./ticket-card-header";
import { TicketDraftEditor } from "./ticket-draft-editor";
import { TicketFields } from "./ticket-fields";

const STATUS_BADGES: Record<DraftStatus, { tone: StatusTone; label: string }> =
  {
    pending: { tone: "warning", label: "Aguardando confirmação" },
    confirmed: { tone: "success", label: "Confirmado" },
    cancelled: { tone: "neutral", label: "Cancelado" },
    superseded: { tone: "neutral", label: "Substituído" },
    unavailable: { tone: "neutral", label: "Indisponível" },
  };

interface TicketDraftCardProps {
  draft: TicketDraft;
  values: DraftValues;
  status: DraftStatus;
  failureLine: string | null;
  canRetry: boolean;
  /** Falso com turno ou ação em andamento, ou com o chat bloqueado. */
  interactive: boolean;
  busyAction: "confirm" | "cancel" | null;
  onConfirm: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onSave: (values: DraftValues) => void;
}

export function TicketDraftCard({
  draft,
  values,
  status,
  failureLine,
  canRetry,
  interactive,
  busyAction,
  onConfirm,
  onCancel,
  onRetry,
  onSave,
}: TicketDraftCardProps) {
  const isMac = useIsMac();
  const [isEditingState, setIsEditing] = useState(false);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const hadFocusRef = useRef(false);
  const isPending = status === "pending";
  const isEditing = isEditingState && isPending;
  const isBusy = busyAction !== null;
  const canAct = interactive && isPending && !isBusy;
  const badge = STATUS_BADGES[status];

  // A barra e "Tentar de novo" saem da tela durante e depois da ação: o foco
  // de quem usa teclado fica no card, não no body.
  useEffect(() => {
    if (hadFocusRef.current && document.activeElement === document.body) {
      articleRef.current?.focus();
    }
  }, [status, busyAction, failureLine]);

  const closeEditor = () => {
    setIsEditing(false);
    requestAnimationFrame(() => editButtonRef.current?.focus());
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
    if (!canAct || isEditing) return;
    // Com o foco em Cancelar ou Editar, o atalho não pode confirmar.
    const { target } = event;
    if (
      target instanceof HTMLButtonElement &&
      target !== confirmButtonRef.current
    ) {
      return;
    }
    event.preventDefault();
    onConfirm();
  };

  const header =
    draft.kind === "REOPEN"
      ? {
          kind: "Reabrir chamado",
          number: draft.ticket.code,
          title: draft.ticket.title,
          description: values.kind === "REOPEN" ? values.reason : draft.reason,
        }
      : draft.kind === "CREATE"
      ? {
          kind: "Novo chamado",
          number: "Rascunho",
          title: values.kind === "CREATE" ? values.title : draft.title,
          description:
            values.kind === "CREATE" ? values.description : draft.description,
        }
      : {
          kind: "Complemento",
          number: draft.ticket.code,
          title: draft.ticket.title,
          description:
            values.kind === "COMPLEMENT" ? values.content : draft.content,
        };

  return (
    <article
      ref={articleRef}
      tabIndex={-1}
      aria-label={`${header.kind}: ${header.title}`}
      onKeyDown={handleKeyDown}
      onFocus={() => {
        hadFocusRef.current = true;
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next && !event.currentTarget.contains(next)) {
          hadFocusRef.current = false;
        }
      }}
      className="overflow-hidden rounded-xl border border-line-card bg-paper shadow-card outline-none"
    >
      <TicketCardHeader
        kind={header.kind}
        number={header.number}
        status={
          <StatusBadge tone={badge.tone} strong>
            {badge.label}
          </StatusBadge>
        }
        title={header.title}
        description={isEditing ? undefined : header.description}
      />

      {isEditing ? (
        <TicketDraftEditor
          initialValues={values}
          onDiscard={closeEditor}
          onSave={(next) => {
            onSave(next);
            closeEditor();
          }}
        />
      ) : (
        <>
          <TicketFields fields={draftCardFields(draft, values, new Date())} />
          {isPending ? (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-rule bg-desk py-2 pr-3.5 pl-2">
              <Button
                ref={confirmButtonRef}
                aria-disabled={canAct ? undefined : true}
                aria-busy={busyAction === "confirm" || undefined}
                aria-keyshortcuts="Meta+Enter Control+Enter"
                kbd={busyAction === "confirm" ? undefined : isMac ? "⌘↵" : "Ctrl ↵"}
                onClick={() => {
                  if (canAct) onConfirm();
                }}
                className="aria-disabled:hover:bg-cta"
              >
                {busyAction === "confirm" ? "Confirmando" : "Confirmar"}
              </Button>
              <Button
                ref={editButtonRef}
                variant="secondary"
                aria-disabled={canAct ? undefined : true}
                onClick={() => {
                  if (canAct) setIsEditing(true);
                }}
              >
                Editar
              </Button>
              <Button
                variant="ghost"
                aria-disabled={canAct ? undefined : true}
                aria-busy={busyAction === "cancel" || undefined}
                onClick={() => {
                  if (canAct) onCancel();
                }}
              >
                {busyAction === "cancel" ? "Cancelando" : "Cancelar"}
              </Button>
            </div>
          ) : null}
        </>
      )}

      {failureLine ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-rule px-4.5 py-2.5">
          <p role="alert" className="text-caption text-danger-text">
            {failureLine}
          </p>
          {canRetry && canAct ? (
            <Button variant="secondary" onClick={onRetry}>
              Tentar de novo
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
