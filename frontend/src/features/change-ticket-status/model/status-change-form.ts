import { z } from "zod";
import {
  analystTargetStatusSchema,
  type AnalystTargetStatus,
  type ConsoleTicketStatus,
} from "@/entities/ticket";

export const NOTE_MAX = 1000;

const REQUIRED_NOTE_MESSAGES: Partial<Record<AnalystTargetStatus, string>> = {
  WAITING_EMPLOYEE: "Conte o que falta do funcionário.",
  RESOLVED: "Descreva a solução aplicada.",
};

/** A obrigatoriedade da nota vem do backend (`statusNoteRequired`). */
export function statusChangeFormSchema(
  noteRequired: readonly ConsoleTicketStatus[],
) {
  return z
    .object({
      toStatus: analystTargetStatusSchema.nullable(),
      note: z
        .string()
        .trim()
        .max(NOTE_MAX, `Use até ${NOTE_MAX} caracteres na nota.`),
    })
    .superRefine((values, ctx) => {
      if (values.toStatus === null) {
        ctx.addIssue({
          code: "custom",
          path: ["toStatus"],
          message: "Escolha o novo status.",
        });
        return;
      }
      if (values.note === "" && noteRequired.includes(values.toStatus)) {
        ctx.addIssue({
          code: "custom",
          path: ["note"],
          message: REQUIRED_NOTE_MESSAGES[values.toStatus] ?? "Escreva a nota.",
        });
      }
    });
}

export type StatusChangeFormInput = z.input<
  ReturnType<typeof statusChangeFormSchema>
>;
export type StatusChangeFormValues = z.output<
  ReturnType<typeof statusChangeFormSchema>
>;

export interface StatusChangeRequest {
  toStatus: AnalystTargetStatus;
  expectedStatus: ConsoleTicketStatus;
  note?: string;
  conversationId: string;
}

/** O backend é estrito: nenhum campo além destes, e a nota vazia é omitida. */
export function buildStatusChangeRequest(input: {
  toStatus: AnalystTargetStatus;
  note: string;
  expectedStatus: ConsoleTicketStatus;
  conversationId: string;
}): StatusChangeRequest {
  const note = input.note.trim();
  return {
    toStatus: input.toStatus,
    expectedStatus: input.expectedStatus,
    ...(note ? { note } : {}),
    conversationId: input.conversationId,
  };
}
