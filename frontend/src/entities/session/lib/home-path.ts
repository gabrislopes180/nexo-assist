import type { SessionUser } from "../model/session-user";

const HOME_PATHS: Record<SessionUser["role"], string> = {
  EMPLOYEE: "/console/employee",
  ANALYST: "/console/analyst",
};

export function homePathFor(role: SessionUser["role"]): string {
  return HOME_PATHS[role];
}
