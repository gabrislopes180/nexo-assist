import type { PrismaClient } from "../generated/prisma/client.js";
import type { SessionUser } from "../shared/session.js";

export class EmailNotFoundError extends Error {
  constructor() {
    super("E-mail não encontrado");
    this.name = "EmailNotFoundError";
  }
}

export type AuthService = {
  login(email: string): Promise<SessionUser>;
  findSessionUser(userId: string): Promise<SessionUser | null>;
};

const sessionUserSelect = { id: true, name: true, email: true, role: true, department: true } as const;

export function createAuthService(client: Pick<PrismaClient, "user">): AuthService {
  return {
    async login(email) {
      const user = await client.user.findUnique({ where: { email }, select: sessionUserSelect });
      if (!user) throw new EmailNotFoundError();
      return user;
    },
    findSessionUser(userId) {
      return client.user.findUnique({ where: { id: userId }, select: sessionUserSelect });
    },
  };
}
