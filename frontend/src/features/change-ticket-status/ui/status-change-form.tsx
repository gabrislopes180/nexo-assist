"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import {
  analystTargetStatusSchema,
  CONSOLE_STATUS_LABELS,
  type AnalystTargetStatus,
  type ConsoleTicketDetail,
} from "@/entities/ticket";
import { useIsMac } from "@/shared/lib/hooks/use-is-mac";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { ChoiceChips } from "@/shared/ui/choice-chips";
import { TextArea } from "@/shared/ui/text-area";
import { useChangeTicketStatus } from "../api/use-change-ticket-status";
import {
  statusChangeFailure,
  type StatusChangeFailure,
} from "../lib/status-change-failure";
import {
  buildStatusChangeRequest,
  NOTE_MAX,
  statusChangeFormSchema,
  type StatusChangeFormInput,
  type StatusChangeFormValues,
} from "../model/status-change-form";

interface StatusChangeFormProps {
  ticket: ConsoleTicketDetail;
  /** Conversa aberta no console; o backend confere que é do dono do chamado. */
  conversationId: string;
}

type Result =
  | { kind: "saved"; label: string }
  | { kind: "unchanged"; label: string }
  | { kind: "error"; failure: StatusChangeFailure };

const EMPTY: StatusChangeFormInput = { toStatus: null, note: "" };

const NOTE_LABELS: Partial<Record<AnalystTargetStatus, string>> = {
  WAITING_EMPLOYEE: "O que falta do funcionário",
  RESOLVED: "Solução aplicada",
};

function targetsOf(ticket: ConsoleTicketDetail): AnalystTargetStatus[] {
  return ticket.allowedStatuses.flatMap((status) => {
    const parsed = analystTargetStatusSchema.safeParse(status);
    return parsed.success ? [parsed.data] : [];
  });
}

export function StatusChangeForm({
  ticket,
  conversationId,
}: StatusChangeFormProps) {
  const isMac = useIsMac();
  const hintId = useId();
  const titleId = useId();
  // Âncora estável: quando a nota e os botões somem (salvar, cancelar, conflito,
  // resolver), o foco vem para cá em vez de cair no body.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const keepFocus = () => headingRef.current?.focus();
  const { mutate, isPending } = useChangeTicketStatus();
  // O estado da mutation só muda no próximo render; a ref barra o duplo envio.
  const sendingRef = useRef(false);
  const [result, setResult] = useState<Result | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [seenStatus, setSeenStatus] = useState(ticket.status);

  const schema = useMemo(
    () => statusChangeFormSchema(ticket.statusNoteRequired),
    [ticket.statusNoteRequired],
  );
  const { control, register, handleSubmit, reset, setValue, formState } =
    useForm<StatusChangeFormInput, unknown, StatusChangeFormValues>({
      resolver: zodResolver(schema),
      mode: "onSubmit",
      reValidateMode: "onChange",
      defaultValues: EMPTY,
    });
  const toStatus = useWatch({ control, name: "toStatus" });
  const note = useWatch({ control, name: "note" });

  const targets = targetsOf(ticket);
  // Destino que saiu de `allowedStatuses` (outro analista mudou) conta como nenhum.
  const chosen =
    toStatus !== null && targets.includes(toStatus) ? toStatus : null;

  // Outro analista mudou o status com o formulário em uso: avisa e passa a
  // mandar o status novo, que agora está na tela. A nota fica.
  if (seenStatus !== ticket.status) {
    setSeenStatus(ticket.status);
    const hasDraft = toStatus !== null || note.trim() !== "";
    // No 409 o alerta de conflito já explica; não repete o aviso.
    const staleError = result?.kind === "error" && result.failure.stale;
    if (!isPending && hasDraft && !staleError) {
      setNotice(
        `O status mudou para ${CONSOLE_STATUS_LABELS[ticket.status]} enquanto você escrevia.`,
      );
    }
  }

  const onSubmit = (values: StatusChangeFormValues) => {
    if (sendingRef.current || isPending) return;
    const target = values.toStatus;
    if (target === null || !targets.includes(target)) {
      setValue("toStatus", null);
      return;
    }
    sendingRef.current = true;
    setResult(null);
    setNotice(null);
    const label = CONSOLE_STATUS_LABELS[target];
    mutate(
      {
        code: ticket.code,
        body: buildStatusChangeRequest({
          toStatus: target,
          note: values.note,
          expectedStatus: ticket.status,
          conversationId,
        }),
      },
      {
        onSuccess: ({ changed }) => {
          reset(EMPTY);
          setNotice(null);
          setResult({ kind: changed ? "saved" : "unchanged", label });
          keepFocus();
        },
        onError: (error) => {
          const failure = statusChangeFailure(error);
          // A nota fica: o analista confere o status novo e escolhe de novo.
          if (failure.stale) {
            setValue("toStatus", null);
            keepFocus();
          }
          setNotice(null);
          setResult({ kind: "error", failure });
        },
        onSettled: () => {
          sendingRef.current = false;
        },
      },
    );
  };

  const cancel = () => {
    reset(EMPTY);
    setResult(null);
    setNotice(null);
    keepFocus();
  };

  const submitOnShortcut = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const failure = result?.kind === "error" ? result.failure : null;
  const noteLength = note.trim().length;
  // Avisos visíveis em um nó sempre montado: live region inserida já com texto
  // muitas vezes não é anunciada.
  const statusMessage =
    result?.kind === "unchanged" ? (
      <span className="text-ink-2">
        O chamado já estava em {result.label}. Nada foi gravado, nem a nota.
      </span>
    ) : notice ? (
      <span className="text-warning-text">{notice}</span>
    ) : null;

  // Título, anúncios e aviso ficam fora dos dois ramos: ao resolver, o
  // formulário some, mas o foco e o leitor de tela continuam no mesmo nó.
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <h3
        id={titleId}
        ref={headingRef}
        tabIndex={-1}
        className="text-caption font-medium text-ink-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cta"
      >
        {targets.length === 0 ? "Status" : "Mudar status"}
      </h3>
      <p role="status" className="sr-only">
        {result?.kind === "saved"
          ? `Status alterado para ${result.label}.`
          : ""}
      </p>
      {targets.length === 0 && ticket.status === "RESOLVED" ? (
        <p className="text-small text-ink-3">
          Chamado resolvido. Só o funcionário pode reabrir.
        </p>
      ) : null}
      <p role="status" className="text-caption empty:hidden">
        {statusMessage}
      </p>
      {targets.length === 0 ? null : (
        <form
          noValidate
          aria-busy={isPending || undefined}
          onSubmit={(event) => void handleSubmit(onSubmit)(event)}
          className="flex flex-col gap-4"
        >
          <Controller
            control={control}
            name="toStatus"
            render={({ field }) => (
              <ChoiceChips
                legend="Mudar status para"
                name={field.name}
                options={targets.map((status) => ({
                  value: status,
                  label: CONSOLE_STATUS_LABELS[status],
                }))}
                value={chosen}
                disabled={isPending}
                onChange={(value) => {
                  field.onChange(value);
                  setResult(null);
                }}
              />
            )}
          />

          {chosen ? (
            <>
              <div className="flex flex-col gap-1.5">
                <TextArea
                  label={NOTE_LABELS[chosen] ?? "Nota interna (opcional)"}
                  rows={3}
                  readOnly={isPending}
                  aria-describedby={hintId}
                  aria-required={
                    ticket.statusNoteRequired.includes(chosen) || undefined
                  }
                  aria-keyshortcuts="Meta+Enter Control+Enter"
                  error={formState.errors.note?.message}
                  onKeyDown={submitOnShortcut}
                  {...register("note")}
                />
                <p
                  id={hintId}
                  className="flex items-center justify-between gap-3 text-caption text-ink-3"
                >
                  <span>Só analistas veem esta nota.</span>
                  <span
                    className={cn(noteLength > NOTE_MAX && "text-danger-text")}
                  >
                    {noteLength}/{NOTE_MAX}
                  </span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="submit"
                  aria-busy={isPending || undefined}
                  aria-disabled={isPending || undefined}
                  aria-keyshortcuts="Meta+Enter Control+Enter"
                  kbd={isPending ? undefined : isMac ? "⌘↵" : "Ctrl ↵"}
                  className="aria-disabled:hover:bg-cta"
                >
                  {isPending
                    ? "Salvando"
                    : failure?.retryable
                      ? "Tentar de novo"
                      : "Salvar status"}
                </Button>
                <Button
                  variant="ghost"
                  aria-disabled={isPending || undefined}
                  onClick={() => {
                    if (!isPending) cancel();
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </>
          ) : null}

          {failure ? (
            <p role="alert" className="text-caption text-danger-text">
              {failure.message}
            </p>
          ) : null}
        </form>
      )}
    </section>
  );
}
