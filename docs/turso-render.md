# Turso, Render e frontend Vercel

O frontend existente está em <https://nexo-assist-alpha.vercel.app>. A API ainda precisa ser criada na Render; esta integração não publica serviços nem modifica painéis. Começar com uma instância de API, pois o barramento SSE é em memória.

## Destino e credenciais

Execute os comandos do backend em `backend/`. `DATABASE_URL` é a única escolha do destino, independente de `NODE_ENV`:

| Modo | Configuração |
|---|---|
| SQLite local | `DATABASE_URL=file:./dev.db`; token dispensável |
| Turso remoto | `DATABASE_URL=libsql://SEU-BANCO.turso.io` e `TURSO_AUTH_TOKEN` separado |

Os endereços acima são exemplos, não configuração de deploy pronta. Não inclua token, parâmetros TLS nem credenciais na URL. O SDK instalado também suporta HTTP e WebSocket, mas o contrato deste projeto aceita apenas `file:` e `libsql:` com TLS. Não há réplica embutida nem banco selecionado por `NODE_ENV`. O formato DateTime continua ISO 8601, conforme o adapter já utilizado; enums e JSON seguem os contratos existentes.

`.env` e tokens permanecem ignorados. Não copie a `.env` para logs, issues ou GitHub. O `postinstall` gera o Prisma Client, sem conectar: precisa de `DATABASE_URL` para carregar a configuração, mas não de token de produção. O CI fornece `file:./ci.db`.

## SQLite local e isolamento dos testes

Antes de usar comandos locais, escolha conscientemente um arquivo local. No PowerShell, uma substituição temporária de variável de processo pode ser feita assim, sem editar `.env`:

```powershell
$previousDatabaseUrl = $env:DATABASE_URL
try {
  $env:DATABASE_URL = 'file:./dev.db'
  npm run db:deploy
  npm run dev
} finally {
  $env:DATABASE_URL = $previousDatabaseUrl
}
```

`db:migrate`, `db:deploy`, `db:reset`, `db:setup`, `db:seed` e `db:studio` são locais. Os caminhos destrutivos recusam destino remoto antes de construir um cliente. A configuração do Prisma também bloqueia invocações diretas de `prisma migrate`, `prisma db` e `prisma studio` com destino remoto. Não use essas ferramentas contra o Turso.

**`db:seed`, `db:setup` e `db:reset` continuam destrutivos no SQLite local.** Não os execute para apenas reiniciar a aplicação. O arquivo local existente não é apagado pela integração.

`npm test` faz preload de `test-environment.ts` antes dos workers: força uma URL temporária `file:`, remove token/chave de LLM herdados e impede carregar `.env`. Cada teste de persistência continua recebendo seu próprio SQLite temporário. Os testes comuns não usam Turso nem LLM real. Não execute testes isolados ignorando esse preload; para um arquivo:

```sh
npx tsx --import ./src/db/test-environment.ts --test src/db/database-config.test.ts
```

O libSQL nativo apresenta encerramentos `3221225477` no Windows, já documentados no helper. Se necessário, diagnostique com execução sequencial, sem mascarar o status de saída:

```sh
npx tsx --import ./src/db/test-environment.ts --test --test-concurrency=1 "src/**/*.test.ts"
```

## Preparação explícita do Turso

Com URL/token corretos no ambiente, primeiro execute:

```sh
npm run db:turso:inspect
```

A inspeção usa transação somente leitura e mostra `targetFingerprint`, nomes dos objetos, contagens da aplicação e histórico de migrations. O fingerprint identifica o host sem imprimir seu endereço ou token. Confira o banco escolhido com sua configuração no painel. Tabelas internas `_libsql*`, `_sqld*` e `sqlite_*` são distinguidas das tabelas da aplicação.

Os comandos de escrita exigem o fingerprint retornado como argumento. Substitua `FINGERPRINT_CONFERIDO` pelo valor real; não é uma variável de ambiente nem um token:

```sh
npm run db:turso:migrate -- FINGERPRINT_CONFERIDO
npm run db:turso:init -- FINGERPRINT_CONFERIDO
```

- `migrate` primeiro valida todas as migrations em SQLite temporário. Aplica os arquivos SQL existentes, em ordem, usando `transaction.executeMultiple`, que preserva o corpo de triggers. Não usa `db push`, diff apenas do schema ou split ingênuo por `;`.
- Cada arquivo e seu registro em `_nexo_migrations` fazem commit na mesma transação. O ledger contém nome, SHA-256 do SQL com finais de linha LF e data de aplicação. É separado do `_prisma_migrations` do SQLite local.
- Reexecução confere os checksums e pula o que já foi aplicado. Histórico modificado, desconhecido ou fora de ordem é recusado. O banco sem ledger que já possui estrutura também é recusado; não há baseline automático nem limpeza.
- Uma falha desfaz o arquivo atual; os arquivos anteriores permanecem registrados. Em falha de rede durante commit, inspecione o ledger antes de repetir: a confirmação pode ter sido perdida após o commit. Nunca apague registros de histórico para forçar reaplicação.
- Migrations com `DROP TABLE` ou `DELETE FROM` são recusadas se já existem dados da aplicação. Uma migração incremental futura desse tipo precisa de revisão específica; o comando não oferece opção para forçar destruição. As migrations antigas não foram editadas.
- `init` verifica que todas as sete tabelas da aplicação estão vazias, dentro da mesma transação que insere os módulos fictícios de `seed-data`. Confere as invariantes de SLA, eventos, autoria e conversas antes do commit. Se já existir qualquer dado, recusa sem sobrescrever. Não chama o seed destrutivo.

Depois, confira a conexão, tabelas, histórico, índices, constraints RESTRICT e `ticket_event_no_update` com a inspeção. Os comandos de migrate/init nunca fazem parte de build/start.

## Smoke remoto e continuidade

O comando seguinte escreve registros fictícios explícitos de validação e deve ser executado conscientemente, em banco de demonstração:

```sh
npm run db:turso:smoke -- FINGERPRINT_CONFERIDO
```

Usa serviços reais e runner controlado, sem LLM. Verifica leitura, mensagem/trace/rascunho, confirmação única, consulta de duplicidade, rollback da confirmação inteira, reabertura/SLA, bloqueio de UPDATE no evento e exclusão do dono, transferência, disputa de assumir, resposta humana e devolução. Registra IDs por etapa e não limpa dados do banco depois. Reexecutar cria outro conjunto fictício; não é seed nem teste comum.

Para validar continuidade, reinicie a API com o mesmo ambiente e o mesmo `SESSION_SECRET`; leia a conversa autenticada e confira as mensagens persistidas. A validação de rede desta implementação está em [turso-validation.md](turso-validation.md). Isso não substitui o teste final Vercel → Render de cookies/proxy/SSE.

Em redes Windows com autoridade certificadora intermediária, o Node pode retornar `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. Configure `NODE_EXTRA_CA_CERTS` para um PEM de certificados públicos confiados pela sua organização/Windows. Não versione o PEM local e não use `NODE_TLS_REJECT_UNAUTHORIZED=0`. A sessão de validação utilizou um arquivo temporário de raízes já confiadas pelo Windows; essa configuração não é necessária automaticamente na Render.

## Render: configuração a criar

| Campo | Valor |
|---|---|
| Tipo | Web Service Node, plano Free, uma instância |
| Root directory | `backend` |
| Node | Linha 22, versão 22.14 ou superior (`NODE_VERSION=22`) |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Health check | `/health` |
| Bind | A API usa `0.0.0.0` e o `PORT` da plataforma |

`--include=dev` mantém TypeScript disponível no build mesmo com `NODE_ENV=production`. Build e start não executam seed ou migrations. A credencial do banco permanece apenas no backend.

Configure no ambiente da Render:

| Variável | Configuração |
|---|---|
| `DATABASE_URL` | URL libsql real do banco preparado |
| `TURSO_AUTH_TOKEN` | Token do mesmo banco |
| `LLM_API_KEY` | Chave real do provedor |
| `SESSION_SECRET` | Segredo próprio com pelo menos 32 caracteres; mantenha-o entre reinícios |
| `NODE_ENV` | `production` |
| `CORS_ORIGINS` | `https://nexo-assist-alpha.vercel.app` (sem barra final) |
| `TICKET_SERVICE_SIMULATION` | `off` |
| `AGENT_TIMEOUT_MS` | `100000` |
| `AGENT_MODEL` | Opcional; padrão documentado no `.env.example` |

Não configure SQLite local ou réplica como fonte de verdade no disco efêmero. A API gratuita pode dormir após 15 minutos sem tráfego e o despertar pode demorar cerca de um minuto: isso é diferente do tempo da LLM. Aqueça/verifique `/health` antes da demonstração e trate reconexões/retries na interface existente. [Limitações da Render](https://render.com/docs/free).

Os 100 s do turno deixam margem para banco/rede/serialização antes do limite de 120 s dos rewrites externos da Vercel. O `proxyTimeout: 130000` do Next local não aumenta o limite da plataforma. O despertar da API pode consumir essa margem: nenhuma garantia de tempo resulta apenas de configurar o timeout. [Limites da Vercel](https://vercel.com/docs/limits#proxied-request-timeout).

## Vercel existente: etapa posterior à criação da API

Depois de criar a API e obter sua URL HTTPS real, configure `API_PROXY_TARGET` no projeto Vercel para essa URL e faça novo deploy do frontend: os rewrites são gravados no build. **A URL real da API ainda não foi definida nesta tarefa.** Não use um exemplo `*.onrender.com` como configuração final.

O navegador continua usando `/api/*` na origem do frontend, inclusive `EventSource`. O rewrite encaminha ao backend; não troque para chamadas diretas ao domínio Render. As rotas autenticadas usam `Cache-Control: no-store`; SSE usa `no-cache, no-store, no-transform` e `X-Accel-Buffering: no`.

O cookie existente permanece `HttpOnly`, `Secure` em produção, `SameSite=Lax`, `Path=/`, sem `Domain`. Confira no deploy que `Set-Cookie` chega ao navegador pela origem Vercel e `Cookie` retorna no proxy. Não há motivo para mudar automaticamente para `SameSite=None`.

Checklist final no ambiente publicado:

1. HTTPS, login/logout e `/api/auth/me`; acesso de funcionário/analista e recusa de conversa alheia.
2. Cookie na origem Vercel, sem cache em respostas autenticadas e sem credenciais nos bundles.
3. Chat e confirmação, timeouts com resposta da API antes do proxy externo.
4. SSE sem buffering, atualização entre perfis, expiração da sessão e reconexão após queda/despertar.
5. Transferir/assumir/devolver, recuperar histórico e rascunho após refresh e reinício da API.

O login continua demonstrativo. **Ainda não há cota diária/global de chamadas ou tokens nem rate limit geral de chat/login.** Esta integração não é proteção de orçamento: antes de abrir a demo publicamente, limitar acesso e consumo é uma pendência separada.

Referências verificadas: [SQLite/Turso no Prisma v7](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/sqlite), [guia Turso/Prisma](https://docs.turso.tech/sdk/ts/orm/prisma). O guia Turso ainda mostra opções de versões antigas; a implementação usa a API efetivamente instalada do Prisma 7.10.1, sem preview flags.
