import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Preload antes dos workers/imports: um .env remoto nunca vira destino da suíte comum.
process.env.DATABASE_URL = pathToFileURL(path.join(tmpdir(), `nexo-test-${randomUUID()}.db`)).href;
delete process.env.TURSO_AUTH_TOKEN;
delete process.env.LLM_API_KEY;
process.env.DOTENV_CONFIG_PATH = path.join(tmpdir(), `nexo-no-env-${randomUUID()}`);
