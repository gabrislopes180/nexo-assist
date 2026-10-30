import "dotenv/config";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient, type Prisma } from "../generated/prisma/client.js";

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL ?? "",
});

export const prisma = new PrismaClient({ adapter });

/** Cliente recebido no callback de `prisma.$transaction`. */
export type DbTransaction = Prisma.TransactionClient;
