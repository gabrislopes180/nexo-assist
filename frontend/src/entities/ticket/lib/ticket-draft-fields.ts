import { formatDueTime } from "@/shared/lib/format-date";
import type {
  AffectedScope,
  DraftConfirmBody,
  DraftValues,
  TicketDraft,
} from "../model/ticket-draft";
import { ticketCardFields, type TicketCardField } from "./ticket-card-fields";
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  PRIORITY_TONES,
} from "./ticket-labels";

export const AFFECTED_LABELS: Record<AffectedScope, string> = {
  INDIVIDUAL: "Somente você",
  TEAM: "Sua equipe",
  COMPANY: "Toda a empresa",
};

// Os mesmos limites do backend (shared/conversation-draft.ts).
export const DRAFT_TITLE_MAX = 120;
export const DRAFT_TEXT_MAX = 2000;

export type DraftErrors = Partial<
  Record<"title" | "description" | "content", string>
>;

const clean = (text: string) => text.replaceAll("\0", "").trim();

export function initialDraftValues(draft: TicketDraft): DraftValues {
  if (draft.kind === "COMPLEMENT") {
    return { kind: "COMPLEMENT", content: draft.content };
  }
  return {
    kind: "CREATE",
    title: draft.title,
    description: draft.description,
    affectedScope: draft.affectedScope,
  };
}

export function draftCardFields(
  draft: TicketDraft,
  values: DraftValues,
  now: Date,
): TicketCardField[] {
  if (draft.kind === "COMPLEMENT") return ticketCardFields(draft.ticket);

  const scope =
    values.kind === "CREATE" ? values.affectedScope : draft.affectedScope;
  return [
    { label: "Categoria", value: CATEGORY_LABELS[draft.category] },
    {
      label: "Prioridade",
      value: PRIORITY_LABELS[draft.priority],
      dot: PRIORITY_TONES[draft.priority],
      note: `· resposta até ${formatDueTime(draft.dueAtPreview, now)}`,
    },
    { label: "Afetados", value: AFFECTED_LABELS[scope] },
  ];
}

function textError(text: string, max: number, emptyMessage: string) {
  const length = clean(text).length;
  if (length === 0) return emptyMessage;
  if (length > max) {
    return `Use até ${max.toLocaleString("pt-BR")} caracteres.`;
  }
  return undefined;
}

export function validateDraftValues(values: DraftValues): DraftErrors {
  const errors: DraftErrors = {};
  if (values.kind === "COMPLEMENT") {
    const content = textError(values.content, DRAFT_TEXT_MAX, "Escreva o complemento.");
    if (content) errors.content = content;
    return errors;
  }

  const title = textError(values.title, DRAFT_TITLE_MAX, "Escreva um título.");
  const description = textError(
    values.description,
    DRAFT_TEXT_MAX,
    "Escreva a descrição.",
  );
  if (title) errors.title = title;
  if (description) errors.description = description;
  return errors;
}

export function draftConfirmBody(
  draft: TicketDraft,
  values: DraftValues,
): DraftConfirmBody {
  if (values.kind === "COMPLEMENT") {
    return { kind: "COMPLEMENT", content: clean(values.content) };
  }

  const body: DraftConfirmBody = {
    kind: "CREATE",
    title: clean(values.title),
    description: clean(values.description),
    affectedScope: values.affectedScope,
  };
  // O detalhe descreve a abrangência original: com outra, ele mentiria.
  if (
    draft.kind === "CREATE" &&
    draft.affectedDescription &&
    draft.affectedScope === values.affectedScope
  ) {
    body.affectedDescription = draft.affectedDescription;
  }
  return body;
}
