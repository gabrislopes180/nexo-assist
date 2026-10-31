import { useMutation, useQueryClient } from "@tanstack/react-query";
import { signIn } from "./login";

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (email: string) => signIn(queryClient, email),
  });
}
