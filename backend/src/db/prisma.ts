import "dotenv/config";
import type { Prisma } from "../generated/prisma/client.js";
import { createDatabaseClient } from "./client.js";
import { loadDatabaseConfig } from "./database-config.js";

export const prisma = createDatabaseClient(loadDatabaseConfig(process.env));

/** Cliente recebido no callback de `prisma.$transaction`. */
export type DbTransaction = Prisma.TransactionClient;
