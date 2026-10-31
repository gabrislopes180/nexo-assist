import { z } from "zod";

export const loginFormSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Informe seu e-mail.")
    .toLowerCase()
    .max(254, "Use um e-mail com até 254 caracteres.")
    .pipe(z.email("Use um e-mail válido, como nome@nexo.com.br.")),
  password: z.string().min(1, "Informe sua senha."),
  keepConnected: z.boolean(),
});

export type LoginFormInput = z.input<typeof loginFormSchema>;
export type LoginFormValues = z.output<typeof loginFormSchema>;
