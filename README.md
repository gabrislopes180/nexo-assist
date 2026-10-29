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
  chatRoute -- "9. stream: ações + resposta" --> chat

  gate -. "com analista: salva sem chamar o LLM" .-> conv
  console -.-> consoleRoute -.-> conv
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
| Modelo | _a definir_ |

## Estrutura

```
nexo-assist/
├── frontend/          Chat do funcionário e console do analista
└── backend/src/
    ├── api/           Rotas Express (sessão, chat, console)
    ├── agent/         Agent Mastra, tools e instruções
    ├── tickets/       Serviço de chamados simulado
    ├── knowledge/     Central de ajuda
    ├── db/            Schema, migrations e seed
    └── shared/        Tipos compartilhados
```

## Como rodar

_A definir._

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
