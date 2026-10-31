import { ApiError } from "@/shared/api/api-error";
import { apiRequest } from "@/shared/api/http-client";
import {
  sessionResponseSchema,
  type SessionUser,
} from "../model/session-user";

export async function getSession(): Promise<SessionUser | null> {
  try {
    const { user } = await apiRequest("/auth/me", {
      schema: sessionResponseSchema,
    });
    return user;
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.kind === "http" &&
      error.status === 401
    ) {
      return null;
    }
    throw error;
  }
}
