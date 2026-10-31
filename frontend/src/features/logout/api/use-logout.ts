import { useMutation, useQueryClient } from "@tanstack/react-query";
import { signOut } from "./logout";

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({ mutationFn: () => signOut(queryClient) });
}
