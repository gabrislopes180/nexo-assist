# Validação da integração Turso — 05/11/2026

Escopo executado: backend local Node 22.14.0, Prisma/adapter 7.10.1, `@libsql/client` 0.17.4 e Turso remoto autenticado. Não houve chamada real à LLM, commit, deploy ou alteração em painéis da Render/Vercel. Os arquivos `.env`, `.env.local` e o SQLite de desenvolvimento foram preservados.

## Inspeção e preparação remota

- Identificador seguro do alvo: `7bf1856b62c5` (SHA-256 truncado do host). O host foi conferido com o nome de banco esperado `nexo-assist-db`; endereço/token não estão neste relatório.
- A primeira inspeção, em transação somente leitura, retornou schema vazio, sem tabelas internas nem da aplicação.
- O ambiente Node local inicialmente rejeitou a cadeia TLS (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`). A validação utilizou `NODE_EXTRA_CA_CERTS` apontando para PEM temporário das raízes públicas já confiadas pelo Windows. Não foi desativada a validação TLS, nem alterado o `.env`.
- As migrations foram validadas em SQLite temporário e depois aplicadas pelo SDK libSQL em transações por arquivo. O comando não executou `prisma migrate deploy` contra `libsql://`.

| Migration | Prefixo do checksum SHA-256 |
|---|---|
| `20261029211917_init` | `53607b53ff99` |
| `20261030024714_ticket_event_restrict` | `9c717ebac444` |
| `20261103041350_console_attendance` | `18941daa75d1` |
| `20261103212436_message_system_kind` | `a712fdec1f92` |

Os hashes completos e instantes de aplicação estão em `_nexo_migrations`. Os arquivos SQL históricos permaneceram inalterados. Foram conferidos as sete tabelas, os dez índices de aplicação, as três FKs RESTRICT de `TicketEvent`, o trigger `ticket_event_no_update`, as colunas de continuidade e a ausência de violações de FK.

A inicialização vazia inseriu, em transação: **5 usuários, 8 artigos, 9 chamados, 18 eventos, 9 conversas, 101 mensagens e 2 contadores**. Os prazos/datas foram construídos em relação ao instante da execução pelos módulos existentes de seed-data. Nenhuma conversa pessoal do SQLite local foi copiada.

Após o smoke, repetir `initializeDemo` foi recusado e as contagens/histórico antes/depois permaneceram iguais. Repetir o migrador retornou zero migrations aplicadas. Não houve limpeza de dados.

## Smoke remoto executado

Os serviços reais foram exercitados com runner controlado. Registros fictícios mantidos no banco para identificação:

| Registro | Identificador |
|---|---|
| Funcionário fictício de smoke | `cmw41wzro0000s4pejyuzia8s` |
| Conversa de smoke | `cmw41wzsv0001s4pe9r8r7xsp` |
| Rascunho inicial, consumido pela confirmação | `a7dd75bc-68b8-47ac-b368-a30574fc7443` |
| Chamado criado/reaberto | `INC-20411` |

Verificações aprovadas:

- Leitura autenticada dos usuários e artigos; enums/DateTime retornados pelo adapter.
- Mensagens, transparência JSON, anexos e proposta pendente persistidos; nenhum chamado criado antes da confirmação.
- Falha controlada depois de executar a confirmação, antes de commit: ticket/evento/contador/mensagem foram revertidos e o rascunho permaneceu disponível.
- Confirmação seguinte criou um chamado; repetir a mesma confirmação foi recusado, sem duplicar. A busca de semelhantes localizou o chamado fictício.
- Resolução e reabertura pelos serviços, com nova janela de SLA consistente entre Ticket e TicketEvent e `resolvedAt` limpo.
- UPDATE em evento bloqueado pelo trigger; exclusão do dono bloqueada por FK. Ambas as tentativas estavam em transações forçadas a rollback.
- Transferência `EMPLOYEE_REQUEST`, disputa de dois analistas com um único vencedor, resposta humana e devolução ao agent.

Contagens finais: **6 usuários, 8 artigos, 10 chamados, 22 eventos, 10 conversas, 113 mensagens e 2 contadores**.

## Reinício e recuperação pela API

A API compilada foi iniciada em uma porta local livre, apontando para o Turso. Foi feito login no funcionário fictício e lida a conversa de smoke e a conversa ativa. Essa instância foi encerrada e iniciada novamente com o mesmo segredo de sessão. A mesma sessão autenticou depois do reinício e a resposta da conversa foi idêntica:

- `WITH_AGENT`, cota consumida `3`, **12 mensagens**, incluindo o histórico do analista;
- `Cache-Control: no-store` na leitura autenticada;
- conexão remota confirmada pelo startup; nenhum turno/chamada de LLM;
- os processos de desenvolvimento existentes não foram encerrados por esse teste.

Isso comprova recuperação pela API local usando rede/Turso. Cookies `Secure`, rewrites, CORS e SSE no caminho Vercel → Render ainda dependem da API publicada e dos testes finais do [guia](turso-render.md).

## Validação automatizada local

- `npm run typecheck` e `npm run build`: aprovados.
- Suíte completa sequencial: **1.141 testes aprovados**, zero falhas, usando exclusivamente SQLite temporário e modelos controlados.
- Última execução direcionada: **29 testes aprovados**, incluindo SSE, configuração/segredos, guardas dos comandos, checksums, rollback de migration, recusa de banco desconhecido, drift de índice, inicialização única e smoke com recuperação em novo cliente.
- `npm run postinstall` também aprovado com `.env` desabilitado, URL SQLite de CI e sem token/chave reais; a geração não criou banco nem acessou Turso.
- Manifest/lockfile conferidos; `@libsql/client` já era transitivo e passou a dependência direta, sem atualização ampla. Histórico SQL inalterado e `git diff --check` aprovado.
- `db:deploy` local foi executado com sucesso em arquivo novo `file:./...`, aplicando as quatro migrations pelo engine Prisma. O banco `dev.db` não foi usado.

Observações do ambiente Windows: a primeira execução paralela teve dois encerramentos nativos `3221225477` e um `SQLITE_FULL` transitório; os 63 testes dos arquivos afetados passaram isoladamente, e depois a suíte inteira sequencial passou. Na checagem extra do engine Prisma com URLs absolutas `file:///C:/...`, houve `Schema engine error` sem detalhe; o caminho relativo documentado funcionou. O adapter libSQL funcionou com os arquivos temporários absolutos usados pela suíte e com Turso. Nenhuma dessas falhas foi contornada apagando dados ou desativando TLS.

## Etapas que faltam na hospedagem

Criar a API na Render com as variáveis/comandos do guia, obter sua URL HTTPS real, configurar `API_PROXY_TARGET` na Vercel e fazer novo deploy do frontend. Validar login/logout, Cookie/Set-Cookie, SSE/reconexão e recuperação pelo domínio publicado. A integração não adiciona limite global/diário de custo da LLM; esse controle continua pendente antes de abrir a demo publicamente.
