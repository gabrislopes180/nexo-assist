import type { PrismaClient } from "../generated/prisma/client.js";

type Log = { log: (message: string) => void; error: (message: string) => void };

/**
 * O Prisma Client conecta de forma lazy, então sem uma query nada toca o banco na
 * inicialização. Executa um `SELECT 1` e registra o resultado; não lança erro.
 */
export async function checkDatabaseConnection(client: Pick<PrismaClient, "$queryRaw">, log: Log = console): Promise<boolean> {
  try {
    await client.$queryRaw`SELECT 1`;
    log.log("Banco de dados conectado");
    return true;
  } catch (error) {
    log.error(`Falha ao conectar ao banco de dados: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}
