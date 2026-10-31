import { useQuery } from "@tanstack/react-query";
import { getSession } from "./get-session";

export const SESSION_QUERY_KEY = ["session"] as const;

export function useSession() {
  return useQuery({ queryKey: SESSION_QUERY_KEY, queryFn: getSession });
}
