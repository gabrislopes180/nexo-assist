# Nexo Assist

Agent de atendimento do service desk de TI da Nexo. O funcionário descreve o problema no chat e o agent tira dúvidas pela central de ajuda, consulta, abre ou complementa chamados e transfere a conversa para um analista quando precisa.

> Projeto em desenvolvimento. As seções marcadas como _a definir_ serão preenchidas ao longo da implementação.

## Arquitetura

```mermaid
flowchart LR
  subgraph FE["Frontend · Next.js"]
    chat["Chat do funcionário"]
    console["Console do analista"]
  end

  subgraph API["API · Express"]
    auth["Sessão (userId do login)"]
    chatRoute["POST /chat<br/>limite de 30 msgs"]
    gate{"Quem está com<br/>a conversa?"}
    consoleRoute["Rotas /console"]
  end

  llm(["Provedor de LLM"])

  subgraph AG["Agent · Mastra"]
    agent["Agent Nexo Assist"]
    tools["Tools"]
    trace["Registro de transparência"]
  end

  subgraph SV["Serviços"]
    knowledge["KnowledgeService"]
    ticket["TicketService<br/>(simula o legado)"]
    conv["ConversationService"]
  end

  subgraph DB["Dados"]
    prisma["Prisma ORM"]
    sqlite[("SQLite")]
    mem[("Memória do Mastra")]
  end

  chat -- "1. mensagem" --> auth --> chatRoute -- "2. checa estado" --> gate
  gate -- "3. com o agent" --> agent
  agent <-- "4. prompt + tools / decisão" --> llm
  agent -- "5. tool calls" --> tools
  tools -- "6. userId da sessão" --> knowledge
  tools --> ticket
  tools -- "transferência" --> conv
  agent -- "7. registra" --> trace -- "8. salva mensagem + registro" --> conv
  agent -. "histórico" .-> mem
  knowledge & ticket & conv --> prisma --> sqlite
  chatRoute -- "9. JSON: ações + resposta" --> chat

  gate -. "com analista: salva sem chamar o LLM" .-> conv
  console -.-> consoleRoute -.-> conv
  conv -. "10. eventos SSE, depois do commit" .-> chat & console
```

A versão completa e editável está em [`docs/architecture/system-design.drawio`](docs/architecture/system-design.drawio) (abre no [draw.io](https://app.diagrams.net)).

### Princípios

- **O LLM decide, o código garante.** O modelo escolhe qual tool chamar e com quais argumentos. A pausa do agent, o limite de mensagens, a confirmação antes de qualquer escrita e a privacidade são verificados pela API e pelos serviços.
- **O agent não acessa o banco.** As tools chamam serviços (`TicketService`, `KnowledgeService`, `ConversationService`), e só os serviços usam o Prisma.
- **O usuário vem da sessão.** O `userId` nunca é um argumento preenchido pelo LLM, então um funcionário não consegue ver chamados de outro.
- **O serviço de chamados é separado do agent** e simula o sistema legado, com latência e falhas tratadas por timeout e retry.
- **Toda resposta é explicável.** Cada mensagem do agent guarda o que ele entendeu, quais ações tomou, com que confiança e por quê.

## Stack

| Camada | Tecnologias |
|---|---|
| Frontend | Next.js, TypeScript, Zod, React Hook Form, Zustand, TanStack Query, Feature-Sliced Design |
| Backend | Express, TypeScript, Prisma, SQLite |
| Agent | Mastra |
| Modelo | Google Gemini (`gemini-3.5-flash-lite`, pelo Google AI Studio) |

## Estrutura

```
nexo-assist/
├── frontend/          Chat do funcionário e console do analista
└── backend/src/
    ├── api/           Rotas Express (sessão, chat, console)
    ├── auth/          Login simulado e token de sessão
    ├── agent/         Agent Mastra, tools e instruções
    ├── conversations/ Estados da conversa, transferência e atendimento do analista
    ├── console/       Serviço do console do analista
    ├── realtime/      Barramento de eventos e streams SSE
    ├── tickets/       Serviço de chamados simulado
    ├── knowledge/     Central de ajuda
    ├── db/            Conexão e seed (schema e migrations em backend/prisma)
    └── shared/        Tipos compartilhados
```

## Como rodar

Pré-requisito: Node.js 22.13+.

```bash
cd backend
cp .env.example .env   # preencha LLM_API_KEY: sem ela a API não sobe (veja "Variáveis de ambiente")
npm install            # também gera o Prisma Client
npm run db:setup       # aplica as migrations, gera o client e popula com dados de demonstração
npm run dev            # API em http://localhost:8000 (GET /health)
```

Em outro terminal, suba o frontend:

```bash
cd frontend
cp .env.example .env.local   # API_PROXY_TARGET=http://localhost:8000
npm install
npm run dev                  # http://localhost:3000 (login em /login)
```

O navegador só fala com o Next: as chamadas a `/api/*` são reescritas para `API_PROXY_TARGET`, e por isso o cookie de sessão fica no domínio do frontend.

| Variável (`frontend/`) | Obrigatória | Descrição |
|---|---|---|
| `API_PROXY_TARGET` | No build de produção | URL do backend, sem barra final. Os rewrites são gravados no build: sem ela, `npm run build` falha. Em `npm run dev`, o padrão é `http://localhost:8000` |

Outros comandos úteis (em `backend/`):

| Comando | O que faz |
|---|---|
| `npm test` | Testes de regras, serviços e rotas |
| `npm run typecheck` | Checagem de tipos |
| `npm run db:seed` | Recria os dados de demonstração (pode rodar quantas vezes quiser) |
| `npm run db:migrate` | Cria e aplica uma nova migration após mudar o schema |
| `npm run db:reset` | Apaga o banco e recria do zero |
| `npm run db:studio` | Abre o Prisma Studio |

Usuários de demonstração (login simulado, sem senha): `marina.costa@nexo.example`, `juliana.alves@nexo.example` e `ana.souza@nexo.example` (funcionários); `rafael.lima@nexo.example` e `bruno.martins@nexo.example` (analistas).

## Autenticação

O login é simulado: o backend valida apenas se o e-mail existe e ignora a senha enviada. A sessão fica em um cookie `httpOnly` (`nexo_session`) válido por 8 horas, sem renovação automática, e sobrevive a reinícios da API.

| Rota | Body | Resposta de sucesso |
|---|---|---|
| `POST /auth/login` | `{ "email": string }` | `200` com `{ "user": ... }` e o cookie de sessão |
| `GET /auth/me` | nenhum (usa o cookie) | `200` com `{ "user": ... }` |
| `POST /auth/logout` | nenhum | `204` sem body; limpa o cookie, com ou sem sessão válida |

Erros seguem o formato `{ "error": { "code": "...", "message": "..." } }`.

## Chat

`POST /chat` recebe a mensagem do funcionário e devolve a resposta do agent em JSON. Usa o cookie de sessão e aceita só usuários com papel `EMPLOYEE`.

```json
{ "message": "Cadê meu chamado?", "conversationId": "opcional" }
```

Sem `conversationId` cria uma conversa; com ele, continua. `message` tem de 1 a 2000 caracteres, e qualquer campo extra é recusado.

| Código | `error.code` | Quando |
|---|---|---|
| `200` | | `{ conversation, employeeMessage, message, ticketLookup, ticketDraft, quickReplies }` |
| `400` | `INVALID_REQUEST` | Body inválido |
| `401` | `SESSION_MISSING`, `SESSION_INVALID` | Sem sessão válida |
| `403` | `FORBIDDEN` | Usuário não é funcionário |
| `404` | `CONVERSATION_NOT_FOUND` | Conversa inexistente ou de outro dono |
| `409` | `CONVERSATION_MESSAGE_LIMIT_REACHED` | Conversa já tem 30 mensagens do funcionário; nada é gravado |
| `409` | `CONVERSATION_CLOSED` | Conversa encerrada |
| `503` | `AGENT_UNAVAILABLE` | Falha da LLM; o turno é desfeito |
| `500` | `INTERNAL_ERROR` | Erro inesperado; o turno é desfeito |

O envelope:

- `conversation`: `{ id, status, messageCount, messageLimit, remainingMessages, analyst }`. `analyst` é `{ id, name }` ou `null`, e `remainingMessages` é a cota com o agent.
- `employeeMessage`: a mensagem gravada do funcionário (`{ id, authorType: "EMPLOYEE", content, createdAt }`). O `id` substitui o do item otimista e deduplica com o tempo real.
- `message`: a resposta do agent, ou `null` quando a conversa está com analista.
- `ticketLookup`, `ticketDraft` e `quickReplies`: `null` quando a conversa está com analista. `quickReplies` traz atalhos de resposta.

`GET /chat/conversations/:id` devolve `{ conversation, messages }` com todas as mensagens em ordem cronológica, inclusive `ANALYST` (com `author`) e `SYSTEM`. O `trace` vem só nas do `AGENT`. A rota aceita só o dono, com papel `EMPLOYEE`. Conversa de outra pessoa responde `404 CONVERSATION_NOT_FOUND`, igual a inexistente, e um analista recebe `403 FORBIDDEN`. Serve para ressincronizar depois de um `sync RESYNC` e como polling de reserva.

### Transferência para analista

A conversa vai para a fila dos analistas (`status: WAITING_ANALYST`) em dois casos:

- **O agent decide transferir:** pedido do funcionário, chamado vencido aceito pela pessoa, ou baixa confiança. A transferência acontece junto com a resposta do agent.
- **Confirmação de chamado com prioridade final `CRITICAL`:** a transferência é automática, com um resumo montado pelo backend.

Em qualquer caso, o rascunho pendente é descartado e a conversa ganha a mensagem `SYSTEM` "Transferida para um analista". O `conversation.status` de `POST /chat` e da confirmação reflete o estado depois da operação. A mensagem `SYSTEM` não vem nessas respostas: ela chega pelo tempo real (`message.created`) e já está no histórico de `GET /chat/conversations/:id`. Quando `status` chega como `WAITING_ANALYST`, o frontend mostra um aviso, sem travar o composer.

Enquanto a conversa está com analista (`WAITING_ANALYST` ou `WITH_ANALYST`), `POST /chat` com o `conversationId` só grava a mensagem do funcionário, sem chamar o LLM, e responde `200` com `message: null`.

- **Limite:** a mensagem conta em `messageCount`, mas o limite de 30 só bloqueia turnos com o agent. Com o analista, ela é aceita mesmo acima de 30.
- **Volta ao agent:** depois que o analista devolve a conversa, o próximo `POST /chat` volta a ir ao agent. Se a conversa voltou com 30 mensagens ou mais, ele recebe `409 CONVERSATION_MESSAGE_LIMIT_REACHED` e o funcionário abre outra conversa.
- **Encerrada pelo analista:** `POST /chat` responde `409 CONVERSATION_CLOSED`.

### Rascunhos: complementar e abrir chamado

O agent nunca grava no chamado: ele propõe um rascunho, que chega em `ticketDraft` no envelope de `POST /chat`, ou `null` se o turno não propôs nenhum. Cada conversa guarda um rascunho: um novo substitui o anterior. Se o backend não conseguir validar um complemento, a proposta é descartada e a resposta passa a dizer isso.

| `kind` | Campos de `ticketDraft`, além de `id` |
|---|---|
| `COMPLEMENT` | `ticket`, `content` |
| `CREATE` | `type`, `category`, `priority`, `title`, `description`, `affectedScope`, `affectedDescription` (opcional), `dueAtPreview` |
| `REOPEN` | `ticket` (com `status` e `canReopen`), `reason`, `dueAtPreview` |

| Rota | Body | Resposta de sucesso |
|---|---|---|
| `POST /chat/drafts/:id/confirm` | Depende do `kind`, abaixo | `200` com `{ message, ticket, conversation: { id, status } }` |
| `POST /chat/drafts/:id/cancel` | vazio | `200` com `{ message }` |

```json
{ "kind": "COMPLEMENT", "content": "texto de 1 a 2000 caracteres" }
```

```json
{ "kind": "CREATE", "title": "até 120", "description": "até 2000", "affectedScope": "INDIVIDUAL | TEAM | COMPANY", "affectedDescription": "opcional" }
```

```json
{ "kind": "REOPEN", "reason": "texto de 1 a 2000 caracteres" }
```

- **Complemento:** o `content` confirmado é o que vale, então a pessoa pode ajustar o texto. Ele vira um comentário no histórico do chamado e não altera a descrição original, o status nem o prazo.
- **Reabertura:** só chamado resolvido há até 7 dias. O `reason` confirmado é o que vale e fica no histórico do chamado. A prioridade original é mantida, e o prazo recomeça da hora da confirmação.
- **Abertura:** só título, descrição e afetados são editáveis. Tipo, categoria e prioridade ficam como no rascunho, e o prazo real conta da hora da confirmação. A prioridade `CRITICAL` exige escopo `TEAM` ou `COMPANY`: com `INDIVIDUAL`, o chamado fica `HIGH`.

As duas rotas exigem sessão de funcionário, não chamam o modelo e não contam no limite de 30 mensagens. Cancelar não consome número de chamado.

| Código | `error.code` | Quando |
|---|---|---|
| `400` | `INVALID_REQUEST` | Body inválido, ou `kind` diferente do rascunho |
| `401` | `SESSION_MISSING`, `SESSION_INVALID` | Sem sessão válida |
| `403` | `FORBIDDEN` | Usuário não é funcionário |
| `404` | `DRAFT_NOT_FOUND` | Rascunho inexistente, já usado ou de outro dono |
| `409` | `TICKET_NOT_OPEN` | Chamado resolvido; o rascunho é mantido |
| `409` | `TICKET_NOT_REOPENABLE` | Reabertura fora da janela de 7 dias, ou chamado já reaberto; o rascunho é mantido |
| `409` | `CONVERSATION_NOT_WITH_AGENT` | Conversa fora do agent; o rascunho é mantido |
| `503` | `TICKET_SERVICE_UNAVAILABLE` | Só na confirmação; o rascunho é mantido e pode tentar de novo |
| `500` | `INTERNAL_ERROR` | Erro inesperado; nada é gravado e o rascunho é mantido |

`ticketLookup` vem do serviço de chamados, nunca do texto do modelo, e é `null` quando nenhuma consulta rodou. A consulta só enxerga chamados abertos do dono da sessão.

O seed traz conversas com ids fixos para demonstração:

| Id | Dono | Estado |
|---|---|---|
| `seed-conv-closed` | Marina | Encerrada, sem analista |
| `seed-conv-near-limit` | Marina | Com o agent, com 29 mensagens: a próxima é aceita e a seguinte recebe o `409` |
| `seed-conv-waiting` | Juliana | Esperando analista (chamado crítico) |
| `seed-conv-request` | Ana | Esperando analista (pedido da pessoa) |
| `seed-conv-low-confidence` | Juliana | Esperando analista (baixa confiança) |
| `seed-conv-overdue` | Marina | Esperando analista (chamado vencido, `ticketCode` INC-20311) |
| `seed-conv-returned` | Ana | Atendida pelo Bruno e devolvida ao agent |
| `seed-conv-closed-by-analyst` | Juliana | Encerrada pelo Rafael há 3 h |

Há ainda uma conversa sem id fixo atendida pelo Bruno (`WITH_ANALYST`). O dono dela é o Rafael, que é analista, então ela só serve para o console.

## Console do analista

Rotas em `/console`, só para usuários com papel `ANALYST`. Quem não é analista recebe `403 FORBIDDEN`. Qualquer analista lê qualquer conversa, porque a fila é compartilhada. O analista de cada ação vem sempre da sessão.

| Rota | Body | Resposta de sucesso |
|---|---|---|
| `GET /console/conversations` | query `filter` (`all`, `waiting`, `with-agent`, `mine`) e `q` (opcionais) | `{ conversations }` |
| `GET /console/conversations/:id` | | `{ conversation }` |
| `GET /console/conversations/:id/messages` | | `{ messages }`, todas, em ordem cronológica |
| `GET /console/conversations/:id/tickets` | | `{ conversationTicket, otherTickets }` |
| `POST /console/conversations/:id/takeover` | vazio ou `{}` | `{ conversation }` |
| `POST /console/conversations/:id/messages` | `{ "content": "1 a 2000 caracteres" }` | `{ message, conversation }` |
| `POST /console/conversations/:id/return` | vazio ou `{}` | `{ conversation }` |
| `POST /console/conversations/:id/close` | vazio ou `{}` | `{ conversation }` |

**Conversa no console:**

- Campos: `id`, `status`, `owner` (com `department`), `analyst`, `assignedToMe`, `assignedAt`, `handoffReason`, `handoffSummary`, `handoffAt`, `lastMessageAt`, `closedAt`, `messageCount`, `messageLimit`, `lastMessage` (a última que não é `SYSTEM`), `lastAgentConfidence` e `ticketCode`.
- `assignedToMe` é calculado para o analista da sessão.

**Lista:**

- Traz as conversas não encerradas e as encerradas nas últimas 48 h, por `lastMessageAt` decrescente, até 200.
- `q` busca no nome do dono e no `ticketCode`, sem diferenciar acento nem caixa.

**`ticketCode`:**

1. É o chamado do evento mais recente ligado à conversa.
2. Sem evento, vale o primeiro código `INC-`/`REQ-` do resumo da transferência que seja de um chamado do mesmo dono.
3. Senão, `null`.

**Chamados:** `conversationTicket` é o chamado de `ticketCode`, e `otherTickets` traz os demais do dono: abertos primeiro, depois os resolvidos. Só essa rota depende do serviço de chamados. Com ele fora do ar, ela responde `503` e a lista continua respondendo.

**Ações:**

| Ação | Vale em | Efeito | Mensagem `SYSTEM` |
|---|---|---|---|
| Assumir | `WAITING_ANALYST` | Vai para `WITH_ANALYST` com o analista da sessão | "`<Primeiro nome>` assumiu a conversa" |
| Responder | `WITH_ANALYST`, assumida por mim | Grava a mensagem `ANALYST` | |
| Devolver | `WAITING_ANALYST`, ou `WITH_ANALYST` assumida por mim | Volta a `WITH_AGENT` e limpa analista e transferência | "Conversa devolvida ao agent" |
| Encerrar | `WITH_ANALYST`, assumida por mim | Vai para `CLOSED`; o chamado não muda, e analista e transferência ficam como registro | "`<Primeiro nome>` encerrou o atendimento" |

**Concorrência e idempotência:**

- Cada ação é uma transação condicional ao estado esperado.
- Se dois analistas assumem ao mesmo tempo, um vence e o outro recebe `409 CONVERSATION_NOT_WAITING`.
- Assumir de novo (duplo clique) ou encerrar de novo pelo mesmo analista responde `200` com o estado atual, sem nova mensagem.
- Devolver não é idempotente: a segunda chamada encontra `WITH_AGENT` e recebe `409`.

| Código | `error.code` | Quando |
|---|---|---|
| `400` | `INVALID_REQUEST` | Query ou body inválido, ou campo extra |
| `401` | `SESSION_MISSING`, `SESSION_INVALID` | Sem sessão válida |
| `403` | `FORBIDDEN` | Usuário não é analista |
| `404` | `CONVERSATION_NOT_FOUND` | Conversa inexistente |
| `409` | `CONVERSATION_NOT_WAITING` | Assumir ou devolver uma conversa que já não está esperando, ou que é de outro analista |
| `409` | `CONVERSATION_NOT_ASSIGNED` | Responder ou encerrar sem ter assumido |
| `503` | `TICKET_SERVICE_UNAVAILABLE` | Só em `/tickets` |
| `500` | `INTERNAL_ERROR` | Erro inesperado; nada é gravado |

## Tempo real

Dois streams SSE, um por papel. O envio continua pelos `POST`.

| Rota | Quem | Recebe |
|---|---|---|
| `GET /chat/events` | `EMPLOYEE` | Eventos das próprias conversas |
| `GET /console/events` | `ANALYST` | Eventos de todas as conversas |

Antes de o stream abrir, os erros saem em JSON: `401`, `403` e `429 TOO_MANY_STREAMS`, quando o mesmo usuário já tem 5 streams abertos.

| Evento | `data` |
|---|---|
| `sync` | `{ mode: "REPLAY" \| "RESYNC" }`. É sempre o primeiro evento |
| `message.created` | `{ conversationId, message }`, no formato de `GET .../messages` |
| `conversation.updated` | `{ conversation }`: `ChatConversationView` para o funcionário, `ConsoleConversation` completa (com `assignedToMe` de quem recebe) para o analista |
| `tickets.changed` | `{ conversationId, ownerId }`. Só para analistas: o painel de chamados do dono ficou desatualizado |
| `session.expired` | `{}`. A sessão venceu e o servidor encerra o stream |

- **Depois do commit:** os eventos só saem depois que a transação grava. No turno do agent, a mensagem do funcionário chega aos analistas junto com a resposta, porque um turno desfeito a apaga.
- **Heartbeat:** um comentário `: ping` a cada 20 s mantém a conexão viva atrás do proxy do Next, que derruba conexões ociosas em 130 s.
- **Reconexão:** o `EventSource` reenvia o `Last-Event-ID` sozinho, e a query `?lastEventId=` também é aceita. Se o id ainda está no buffer (os últimos 1000 eventos), chega `sync REPLAY` e só o que foi perdido. Senão, chega `sync RESYNC` e o cliente recarrega pelos `GET`.
- **Cliente lento:** quem acumula mais de 256 KB sem ler é desconectado e reconecta pelo mesmo caminho.
- **Limite:** o barramento fica em memória, então vale para uma única instância da API, e um reinício sempre leva a `RESYNC`. Com várias instâncias, o mesmo contrato precisaria de uma tabela outbox com sequência global e pub/sub.

## Variáveis de ambiente

Em `backend/.env`:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | Sim | Banco SQLite, ex.: `file:./dev.db`. Caminho relativo: rode a API a partir de `backend/` |
| `SESSION_SECRET` | Sim | Segredo que assina a sessão, com no mínimo 32 caracteres. O valor do `.env.example` é recusado em produção |
| `CORS_ORIGINS` | Sim | Origens exatas do frontend, separadas por vírgula, sem `*` e sem barra final |
| `LLM_API_KEY` | Sim | Chave do Google AI Studio usada pelo agent |
| `AGENT_MODEL` | Não | Modelo no formato `provider/modelo`; o padrão é `google/gemini-3.5-flash-lite` |
| `AGENT_TIMEOUT_MS` | Não | Limite do turno inteiro do agent, em milissegundos; o padrão é `120000` |
| `TICKET_SERVICE_SIMULATION` | Não | `off` (padrão) ou `down`, que simula o serviço de chamados fora do ar. `down` é recusado em produção |
| `NODE_ENV` | Não | `production` envia o cookie só por HTTPS (`Secure`) |
| `PORT` | Não | Porta da API; o padrão é `8000` |

## Como o agent decide o que fazer

_A definir._

## Qualidade das decisões

_A definir._

## Trade-offs

_A definir._

## Com mais tempo

_A definir._

## Uso de IA no desenvolvimento

_A definir._
