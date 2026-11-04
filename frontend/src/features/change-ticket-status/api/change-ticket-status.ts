import { changeTicketStatusResponseSchema } from "@/entities/ticket";
import { apiRequest } from "@/shared/api/http-client";
import type { StatusChangeRequest } from "../model/status-change-form";

export interface ChangeTicketStatusVariables {
  code: string;
  body: StatusChangeRequest;
}

export function changeTicketStatus({
  code,
  body,
}: ChangeTicketStatusVariables) {
  return apiRequest(`/console/tickets/${encodeURIComponent(code)}/status`, {
    method: "POST",
    body,
    schema: changeTicketStatusResponseSchema,
  });
}
