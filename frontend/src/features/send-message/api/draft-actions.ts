import type { DraftConfirmBody } from "@/entities/ticket";
import { apiRequest } from "@/shared/api/http-client";
import {
  cancelDraftResponseSchema,
  confirmDraftResponseSchema,
} from "../model/chat-schema";

const draftPath = (draftId: string, action: "confirm" | "cancel") =>
  `/chat/drafts/${encodeURIComponent(draftId)}/${action}`;

// Sem LLM: o tempo padrão de 15 s basta.
export function confirmDraft(draftId: string, body: DraftConfirmBody) {
  return apiRequest(draftPath(draftId, "confirm"), {
    method: "POST",
    body,
    schema: confirmDraftResponseSchema,
  });
}

export function cancelDraft(draftId: string) {
  return apiRequest(draftPath(draftId, "cancel"), {
    method: "POST",
    schema: cancelDraftResponseSchema,
  });
}
