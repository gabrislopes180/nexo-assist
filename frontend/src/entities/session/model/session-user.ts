import { z } from "zod";

export const sessionUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.enum(["EMPLOYEE", "ANALYST"]),
  department: z.string().nullable(),
});

export const sessionResponseSchema = z.object({ user: sessionUserSchema });

export type SessionUser = z.infer<typeof sessionUserSchema>;
