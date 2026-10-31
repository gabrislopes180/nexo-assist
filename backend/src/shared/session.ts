import { z } from "zod";
import type { UserRole } from "../generated/prisma/enums.js";

/**
 * Login simulado: só o e-mail é lido. `z.object` descarta qualquer outro campo,
 * inclusive `password`, antes de chegar ao serviço.
 */
export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department: string | null;
};
