import "dotenv/config";
import { defineConfig, env } from "prisma/config";
import { requireLocalDatabase } from "./src/db/database-config.js";

// Generate não conecta; operações do engine Prisma continuam exclusivamente locais.
if (["migrate", "db", "studio"].some((command) => process.argv.includes(command))) requireLocalDatabase(process.env);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx src/db/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
