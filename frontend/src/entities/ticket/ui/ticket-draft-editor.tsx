"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { TextArea } from "@/shared/ui/text-area";
import { TextField } from "@/shared/ui/text-field";
import {
  AFFECTED_LABELS,
  validateDraftValues,
  type DraftErrors,
} from "../lib/ticket-draft-fields";
import { affectedScopeSchema, type DraftValues } from "../model/ticket-draft";

interface TicketDraftEditorProps {
  initialValues: DraftValues;
  onSave: (values: DraftValues) => void;
  onDiscard: () => void;
}

/** Só título, descrição e afetados (ou o texto do complemento) são editáveis. */
export function TicketDraftEditor({
  initialValues,
  onSave,
  onDiscard,
}: TicketDraftEditorProps) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<DraftErrors>({});
  const firstFieldRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    firstFieldRef.current?.querySelector<HTMLElement>("input, textarea")?.focus();
  }, []);

  const update = (next: DraftValues, field: keyof DraftErrors) => {
    setValues(next);
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateDraftValues(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      event.currentTarget
        .querySelector<HTMLElement>("[aria-invalid=true]")
        ?.focus();
      return;
    }
    onSave(values);
  };

  return (
    <form noValidate onSubmit={handleSubmit}>
      <div ref={firstFieldRef} className="flex flex-col gap-4 px-4.5 pb-4">
        {values.kind === "CREATE" ? (
          <>
            <TextField
              label="Título"
              autoComplete="off"
              value={values.title}
              error={errors.title}
              onChange={(event) =>
                update({ ...values, title: event.target.value }, "title")
              }
            />
            <TextArea
              label="Descrição"
              value={values.description}
              error={errors.description}
              onChange={(event) =>
                update(
                  { ...values, description: event.target.value },
                  "description",
                )
              }
            />
            <fieldset className="flex flex-col gap-2">
              <legend className="pb-2 text-label text-ink">Afetados</legend>
              <div className="flex flex-wrap gap-1.5">
                {affectedScopeSchema.options.map((scope) => (
                  <label
                    key={scope}
                    className={cn(
                      "cursor-pointer rounded-md border px-3 py-1.75 text-label has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-cta",
                      values.affectedScope === scope
                        ? "border-info bg-info-soft text-info-text"
                        : "border-rule bg-paper text-ink hover:bg-desk",
                    )}
                  >
                    <input
                      type="radio"
                      name="affectedScope"
                      value={scope}
                      checked={values.affectedScope === scope}
                      onChange={() =>
                        setValues({ ...values, affectedScope: scope })
                      }
                      className="sr-only"
                    />
                    {AFFECTED_LABELS[scope]}
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="text-caption text-ink-3">
              Tipo, categoria e prioridade ficam como no rascunho.
            </p>
          </>
        ) : (
          <TextArea
            label="Complemento"
            rows={5}
            value={values.content}
            error={errors.content}
            onChange={(event) =>
              update({ ...values, content: event.target.value }, "content")
            }
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-t border-rule bg-desk py-2 pr-3.5 pl-2">
        <Button type="submit">Salvar</Button>
        <Button variant="ghost" onClick={onDiscard}>
          Descartar alterações
        </Button>
      </div>
    </form>
  );
}
