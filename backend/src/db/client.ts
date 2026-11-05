import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "../generated/prisma/client.js";
import type { DatabaseConfig } from "./database-config.js";

export function createDatabaseClient({ url, authToken }: DatabaseConfig): PrismaClient {
  // Preserva o formato ISO 8601 já usado pelo adapter; sem réplica/disco local no modo remoto.
  return new PrismaClient({ adapter: new PrismaLibSql({ url, ...(authToken ? { authToken } : {}) }) });
}
