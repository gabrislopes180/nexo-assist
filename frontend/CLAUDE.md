# Frontend — Nexo Assist

Interface do Nexo Assist: chat do funcionário, console do analista, login e Meu perfil.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript estrito (`any` proibido; use `unknown` e estreite o tipo)
- Tailwind CSS 4 + shadcn/ui (Radix), com o tema do design system em `app/globals.css`
- Zustand para estado do cliente, TanStack Query para estado do servidor
- React Hook Form + Zod para formulários e validação
- Ícones: `lucide-react`
- Arquitetura: Feature-Sliced Design (FSD)

## Referência visual

- O design system é a fonte da verdade: `docs/design-system/README.md` (na raiz do repositório). Leia antes de criar qualquer interface.
- Cada componente tem diretrizes em `docs/design-system/components/<Nome>.md`. As telas do protótipo estão em `docs/design-system/screens/`; confira o resultado contra elas.
- `docs/design-system/reference/` é a implementação usada nas prévias, em JavaScript puro. É especificação: reescreva em TSX, nunca copie.

## Estrutura de pastas

```
frontend/
├── app/        Rotas do Next.js (App Router). Só arquivos que o Next exige.
├── pages/      Vazia de propósito (impede o Next de ler src/pages como rotas).
├── public/     Arquivos estáticos (public/brand: símbolo Nexo).
├── proxy.ts    Redireciona /, /console e /profile pela presença do cookie de sessão. Não valida a sessão nem o papel: isso é do SessionGate.
└── src/        Código da aplicação, organizado em camadas FSD.
    ├── app/       Providers, configuração global (QueryClient etc.)
    ├── processes/ Layouts que atravessam várias telas (processes/layouts)
    ├── pages/     Telas montadas, uma por rota
    ├── widgets/   Blocos grandes e independentes de uma tela
    ├── features/  Ações do usuário com valor de negócio
    ├── entities/  Entidades do domínio
    └── shared/    Código reutilizável sem regra de negócio
```

### `app/` da raiz (rotas)

- Só entram `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `route.ts` e o `globals.css`.
- Cada rota é fina e só reexporta a tela da camada `pages`:

```tsx
// app/chat/page.tsx
export { ChatPage as default } from "@/pages/chat";
```

- Nunca crie componentes, hooks ou lógica dentro de `app/`.

## Regras do FSD

### Quem importa quem

As camadas, de cima para baixo: `app` → `processes` → `pages` → `widgets` → `features` → `entities` → `shared`.

- Uma camada só importa das camadas **abaixo** dela. Nunca de cima.
- Slices da mesma camada não se importam entre si: uma feature não importa outra feature, um widget não importa outro widget.
- `shared` não importa nada das outras camadas.
- `processes` importa de `pages` para baixo. `pages` não importa `processes`: só as rotas da raiz `app/` usam essa camada.
- Precisa compartilhar algo entre duas slices da mesma camada? Desça para a camada de baixo (normalmente `entities` ou `shared`) ou faça a composição na camada de cima.

### Public API

- Toda slice expõe o que é público no `index.ts` da raiz dela.
- De fora, importe sempre pela public API: `@/entities/ticket`, nunca `@/entities/ticket/ui/ticket-card`.
- Dentro da própria slice, use imports relativos.
- `shared` é dividido por segmento: importe de `@/shared/ui/button`, `@/shared/lib/utils`, `@/shared/api/...`.

### Segmentos dentro de uma slice

- `ui/` componentes
- `model/` estado (stores Zustand), tipos, schemas Zod, hooks de regra
- `api/` chamadas ao backend e hooks do TanStack Query
- `lib/` funções auxiliares da slice
- `config/` constantes

Crie só os segmentos que a slice usa.

Exceção: `processes/layouts` mantém `sidebar.tsx`, `authenticated-layout.tsx` e `authenticated-shell.tsx` direto na raiz da slice, sem segmento `ui/`.

## Onde fica cada coisa no Nexo

| Camada | Exemplos |
|---|---|
| `shared/ui` | Componentes do shadcn e primitivos do design system: Button, TextField, Checkbox, StatusBadge, Avatar, SearchField, FilterChips |
| `shared/lib` | `cn()`, formatação de datas e prazos ("em até 4 h úteis") |
| `shared/api` | Cliente HTTP base, tratamento de erro comum |
| `entities/ticket` | Tipo e schema do chamado, TicketCard, TicketListItem, CurrentTicket |
| `entities/conversation` | Tipo da conversa e do estado (com o agent, aguardando, com analista), ConversationItem |
| `entities/message` | Tipos de mensagem e registro de transparência, UserMessage, AgentMessage, ConsoleMessage, SystemEvent |
| `entities/session` | Usuário logado |
| `features/` | `send-message`, `confirm-ticket-draft`, `select-ticket`, `takeover-conversation`, `return-to-agent`, `close-conversation`, `login` |
| `widgets/` | `login-hero`, `chat-thread`, `chat-composer`, `conversation-list`, `ticket-panel`, `console-rail` |
| `processes/` | `layouts`: sidebar compartilhado e layout autenticado |
| `pages/` | `login`, `employee-console`, `profile` |

A tabela é um ponto de partida. Se algo não se encaixar, prefira a camada mais baixa que funcione e registre a decisão.

## Estilização

- Use as classes do design system: cores (`bg-paper`, `text-ink-3`, `border-rule`, `bg-info-soft`), texto (`text-body`, `text-label`, `text-caption`), raios (`rounded-md`, `rounded-pill`), sombras (`shadow-card`) e medidas (`w-(--sidebar-width)`).
- As classes do shadcn (`bg-primary`, `text-muted-foreground`) ficam só dentro dos componentes do shadcn.
- Nunca escreva cor em hexadecimal, `rgb()` ou valor solto nos componentes. Se faltar um token, pare e avise.
- Componentes do shadcn: instale com `npx shadcn@latest add <componente>` (vão para `src/shared/ui`) e ajuste alturas, raios e padding ao `.md` correspondente do design system.
- **Nunca rode `npx shadcn@latest init`**: ele sobrescreve o `globals.css` com as cores padrão.
- Todo texto da interface em português do Brasil, seguindo o tom do design system.

## Estado e dados

- Dado que vem do backend (chamados, conversas, mensagens) fica no TanStack Query. Não copie para o Zustand.
- Zustand só para estado do cliente que não vem do servidor (por exemplo, o rascunho do composer ou um painel aberto).
- Valide com Zod tudo o que vem de fora: resposta da API, formulário, parâmetro de URL.
- Todo trecho assíncrono tem estado de carregamento, vazio e erro.

## Convenções

- Pastas e arquivos em kebab-case (`ticket-card.tsx`); componentes em PascalCase (`TicketCard`).
- Um componente por arquivo. Props tipadas com `type` ou `interface` no próprio arquivo.
- Server Components por padrão; `"use client"` só onde há estado, efeito ou evento.
- Acessibilidade WCAG AA: rótulos em campos, foco visível, navegação por teclado, `aria-*` nos controles sem texto.

## Comandos

- `npm run dev`: servidor de desenvolvimento (http://localhost:3000)
- `npm run build`: build de produção
- `npm run lint`: ESLint
- `npm test`: testes de lógica com Vitest, sem DOM (`*.test.ts`)
