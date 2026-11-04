# Antes do deploy: o que falta no Nexo Assist

Relatório de 2026-11-03. Ordem: primeiro o que bloqueia o deploy, depois o que é importante e por fim o que é desejável.

## 0. Estado atual (ler primeiro)

- **Nada do trabalho de 02 e 03/11 está commitado.** O último commit é `ff57c97`. Estão só no working tree:
  - console do analista com API real e SSE;
  - gestão de chamados pelo analista;
  - central de ajuda;
  - encaminhamento fora de escopo;
  - correções da revisão;
  - migrations `20261103041350_console_attendance` e `20261103212436_message_system_kind`.
- **Primeira ação:** revisar `git status` e commitar em partes (backend, agent, frontend) antes de qualquer outra coisa.
- **Antes do commit**, apagar as memórias que os agentes gravaram dentro do repositório. Não são código.
  - `docs/architecture/.claude/`
  - `backend/.claude/agent-memory/`
  - `frontend/.claude/agent-memory/`
- **Card do artigo no chat do funcionário:** pronto. São 473 testes no frontend, e o card ainda não foi testado no navegador. A frase "Fonte: …" continua visível no console do analista. A correção é pequena: aplicar a mesma função `strip-source-note` em `console-timeline`.
- **Em andamento** quando este relatório foi escrito: a busca na central também em relatos de problema (agent). Conferir se terminou, com `npm test`, `npx tsc --noEmit` e `npm run lint` nos dois projetos.
- **Testes no navegador ainda não feitos:** gestão de chamados, fora de escopo e central de ajuda. O fluxo do console e do SSE já foi testado e funcionou.
  - Reiniciar o backend antes, porque o processo antigo não tem as rotas novas: `npm run db:seed` e depois `npm run dev`.

## 1. Bloqueadores (sem isso não dá para pôr no ar)

### 1.1 Autenticação de verdade
- **Situação:** hoje o login é simulado. `POST /auth/login` aceita só o e-mail, sem senha (`schema.prisma`: "login simulado, sem senha"), então qualquer pessoa entra como qualquer usuário, inclusive como analista.
- **Opções:**
  - SSO corporativo (OIDC/SAML, por exemplo Entra ID ou Google Workspace). É o mais adequado para uma ferramenta interna.
  - Senha com hash (argon2/bcrypt), recuperação de senha e bloqueio por tentativas.
- **Cadastro de usuários:** definir como funcionários e analistas são criados e como o papel `ANALYST` é atribuído. Hoje isso só acontece pelo seed.

### 1.2 Banco de dados de produção
- **Situação:** hoje é SQLite em arquivo (`DATABASE_URL="file:./dev.db"`, adapter libsql). Dá para usar em produção com uma única instância e disco persistente, mas:
  - a maioria das hospedagens tem disco efêmero, e o banco some a cada deploy;
  - não há backup.
- **Opções:**
  - (a) Migrar para Postgres gerenciado, que é o recomendado. Isso exige trocar o provider do Prisma, refazer as migrations e revisar as buscas que normalizam acento em memória (`conversation-queries.ts`).
  - (b) Usar Turso/libSQL remoto, com menos mudança no código.
  - (c) Manter SQLite num volume persistente, com backup agendado.
- **Em qualquer opção:**
  - rodar `npm run db:deploy` no deploy;
  - **não** rodar `db:seed` em produção, porque ele recria dados de demonstração;
  - definir os dados iniciais reais: artigos da central de ajuda, usuários e analistas.

### 1.3 Segredos e configuração
- **Backend** (`backend/.env.example`):
  - `SESSION_SECRET`: novo, aleatório, com 32 caracteres ou mais, guardado no gerenciador de segredos da hospedagem.
  - `CORS_ORIGINS`: a URL exata do frontend em produção.
  - `LLM_API_KEY`: chave de produção do Google AI Studio ou Vertex, com limite de gastos configurado.
  - `AGENT_MODEL` e `AGENT_TIMEOUT_MS`: confirmar os valores.
  - `TICKET_SERVICE_SIMULATION=off`: produção já recusa `down`.
  - `NODE_ENV=production`: necessário para o cookie sair `secure`.
- **Frontend:** `API_PROXY_TARGET`, obrigatório no build (sem ele o `npm run build` falha). Criar também o `frontend/.env.local` para o desenvolvimento.

### 1.4 Uma instância só do backend, por enquanto
- **Situação:** o barramento de eventos do SSE (`backend/src/realtime/event-bus.ts`) vive na memória do processo. Com duas ou mais instâncias, quem estiver conectado à instância A não recebe os eventos da B.
- **Para o primeiro deploy:** uma única instância do backend, sem autoscaling horizontal.
- **Para escalar depois:** trocar o barramento por Redis pub/sub ou pelo `LISTEN/NOTIFY` do Postgres.

### 1.5 Proxy e SSE
- **Situação:** o navegador fala só com o Next, que reescreve `/api/*` para o backend. O SSE foi validado assim em dev, com heartbeat de 20 s e sem compressão.
- **Na hospedagem, garantir:**
  - **sem buffering** de resposta em `/api/chat/events` e `/api/console/events`;
  - **sem compressão** nesses endpoints;
  - timeout de conexão ociosa maior que 20 s (o padrão é 60 s ou mais);
  - limites de duração de request que não matem streams longos. Plataformas serverless (por exemplo, funções da Vercel) cortam conexões longas: o backend precisa rodar como serviço contínuo, não como função.
- **Teste:** depois do deploy, repetir o teste dos 200 s com o stream parado, sem queda.

## 2. Importante (logo antes ou logo depois do primeiro deploy)

### 2.1 Segurança da API
- **Rate limit** em `/auth/login`, `POST /chat`, que chama a LLM e custa dinheiro, e nas ações do console. Hoje não existe nenhum.
- **Cabeçalhos de segurança:** `helmet` no Express e cabeçalhos no Next (CSP, HSTS, frame-ancestors).
- **Limite de tamanho do corpo** no `express.json()`, se ainda não estiver configurado.
- **Revisão de segurança:** rodar `/security-review` no código final.

### 2.2 Custos e limites da LLM
- **Gasto por turno:** cerca de 3 mil tokens num turno simples, 6 mil com uma ferramenta e cerca de 3,6 mil a mais com a busca na central.
- **Alertas de custo:** configurar alertas no provedor.
- **Limite por funcionário:** decidir o limite diário. O limite de 30 mensagens por conversa já existe, mas não há limite de conversas.
- **Fallback:** decidir o que fazer quando o provedor responder 429 ou ficar fora. Hoje o turno falha com 503 `AgentUnavailable`.

### 2.3 Observabilidade
- **Logs estruturados**, sem dados pessoais nem conteúdo das conversas em texto puro.
- **Rastreamento de erros:** Sentry ou similar, no backend e no frontend.
- **Health check** (`GET /health`), para a hospedagem reiniciar o serviço. Confirmar se já existe.
- **Métricas:** latência e tokens do agent (o Mastra já expõe traces), conexões SSE abertas e chamados vencidos.

### 2.4 CI
- **Não há pipeline.** Criar um, por exemplo GitHub Actions, que rode `npm ci`, `npx tsc --noEmit`, `npm run lint`, `npm test` e o build nos dois projetos.
- **Queda conhecida:** o libsql cai ao encerrar o processo de testes (exit `3221225477` no Windows, documentado em `backend/src/db/test-database.ts`). No CI em Linux talvez não aconteça. Se acontecer, rodar os arquivos de teste separadamente ou trocar o banco de teste.
- **`npm run eval:agent`** gasta tokens reais: rodar manualmente ou num job agendado, não a cada push.

### 2.5 Dados pessoais (LGPD)
- **Por que importa:** as conversas e os chamados guardam dados pessoais e o texto vai para um provedor de LLM externo.
- **Definir:**
  - o tempo de retenção das conversas;
  - quem acessa (hoje qualquer analista vê todas as conversas);
  - o aviso ao funcionário de que o atendimento usa IA;
  - o contrato e a região de processamento do provedor de LLM.

## 3. Pendências funcionais (não bloqueiam um piloto)

1. **Conversa perdida ao recarregar:** o funcionário que recarrega a página perde a conversa em andamento e não vê a resposta do analista. Precisa de uma rota "minha conversa aberta" no backend e de restauração no frontend. **Recomendado antes de um piloto com analistas reais.**
2. **Fila geral de chamados no console** (`GET /console/tickets?status=&overdue=`): um chamado aberto numa conversa que nunca foi para um analista só aparece se alguém abrir aquela conversa.
3. **Corrida do 409 `CONVERSATION_NOT_WITH_AGENT`:** duas mensagens quase simultâneas, quando a primeira transfere a conversa. Correção: guardar a segunda para o analista em vez de responder 409.
4. **Recarregamento extra na primeira abertura do stream:** o GET inicial poderia devolver a posição do barramento.
5. **Contatos reais** de RH, financeiro e facilities: hoje são fictícios (`backend/src/knowledge/redirect-targets.ts`).
6. **Conteúdo real da central de ajuda:** hoje são 8 artigos do seed, e não há tela de administração para criar ou editar artigos.
7. **Pontos menores da revisão:**
   - a nota obrigatória ausente devolve um 400 genérico;
   - um analista pode mudar o status de um chamado do qual é dono;
   - `changed:false` descarta a nota;
   - mensagens que misturam TI com outra área tratam só a parte de TI.
8. **README:** conferir se está atualizado com tudo o que entrou e acrescentar uma seção de deploy.

## 4. Hospedagem: o que considerar ao escolher

- **Frontend (Next 16):**
  - Vercel ou qualquer host de Node.
  - Se for a Vercel, o backend fica em outro lugar e o `API_PROXY_TARGET` aponta para ele.
  - Confirmar se o rewrite do Next na plataforma escolhida mantém o SSE sem buffering. Senão, o navegador terá de falar direto com o backend (mais CORS e cookie entre domínios).
- **Backend (Express + SSE + Mastra):**
  - Precisa de um processo contínuo, com uma instância e disco persistente se continuar em SQLite.
  - Exemplos: Railway, Render, Fly.io, uma VM ou um container no Cloud Run com `min-instances=1`, `max-instances=1` e timeout longo.
- **Banco:** Postgres gerenciado (Neon, Supabase, RDS, Cloud SQL), Turso, ou um volume com backup.
- **Domínio e cookie:** o mais simples é frontend e API no mesmo domínio, via proxy do Next, o que já acontece hoje. Assim o cookie de sessão (`httpOnly`, `sameSite=lax`) funciona sem mudança.
- **Containers:** não há Dockerfile. Criar um por projeto se a hospedagem pedir.

## 5. Checklist rápido

- [ ] Commitar o trabalho atual (sem as pastas `.claude` de memória)
- [ ] Testar no navegador: chamados, fora de escopo, central de ajuda
- [ ] Autenticação real (1.1)
- [ ] Banco de produção, migrations e dados iniciais reais (1.2)
- [ ] Segredos e variáveis de produção (1.3)
- [ ] Backend com uma instância e SSE sem buffering na hospedagem (1.4, 1.5)
- [ ] Rate limit, helmet, `/security-review` (2.1)
- [ ] Alertas de custo da LLM (2.2)
- [ ] Logs, erros, health check (2.3)
- [ ] CI (2.4)
- [ ] LGPD: retenção, acesso, aviso de IA (2.5)
- [ ] Restaurar conversa ao recarregar (3.1)
