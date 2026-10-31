# Design system — Nexo Assist

Fonte da verdade visual do frontend, extraída do protótipo do desafio (`nexo.pen`).

- **Versão visual navegável:** o artifact "Nexo Assist" (Design System) no Claude, com as prévias ao vivo de todos os componentes.
- **`tokens.json`:** todos os valores (cores, tipografia, espaçamento, raios, sombras, medidas de layout), cada um com nota de uso.
- **`components/*.md`:** diretrizes de cada componente: quando usar, o que recebe, variações.
- **`reference/`:** a implementação de referência usada nas prévias (`components.js`, `components.css`, `components.d.ts`). **Não copie esse código**: ele é JavaScript puro com `createElement`. Reescreva cada componente em TSX dentro da estrutura FSD, usando o `.md` e a referência como especificação.
- **`screens/`:** as 6 telas do protótipo renderizadas em 1440×900. Use para conferir fidelidade.
- **`assets/`:** o símbolo Nexo (também em `frontend/public/brand/`).

## No código (frontend/)

O tema está em `frontend/app/globals.css`, com os mesmos nomes do `tokens.json`:

| Design system | Tailwind | Exemplo |
|---|---|---|
| Cores (`paper`, `ink-3`, `cta`, `info-soft`, `warning-text`...) | `bg-*`, `text-*`, `border-*` | `bg-desk text-ink-3 border-rule` |
| Estilos de texto (`body`, `label`, `caption`, `card-title`...) | `text-*` (tamanho, altura de linha, peso e espaçamento juntos) | `text-body`, `text-caption-strong` |
| Fontes (`ui`, `display`) | `font-ui` (padrão), `font-display` | `font-display text-display-lg` |
| Raios (`radius-xs` … `radius-xl`, `radius-pill`) | `rounded-xs` … `rounded-xl`, `rounded-pill` | bolha do agent: `rounded-lg rounded-tl-xs` |
| Sombras | `shadow-xs`, `shadow-sm`, `shadow-bubble`, `shadow-raised`, `shadow-card`, `shadow-cta` | `shadow-card` |
| Medidas de layout (`sidebar-width`, `topbar-height`...) | valor arbitrário | `w-(--sidebar-width) h-(--topbar-height)` |
| Espaçamento (`space-N` = N px) | escala padrão do Tailwind (N ÷ 4) | `space-14` → `px-3.5`; `space-20` → `gap-5` |

Os componentes do shadcn já usam o tema pelo mapeamento abaixo, sem precisar trocar cor por cor:

| shadcn | Design system |
|---|---|
| `primary` / `primary-foreground` | `cta` / `on-ink` |
| `secondary`, `muted`, `accent` | `desk` |
| `muted-foreground` | `ink-3` |
| `destructive` | `danger-text` |
| `border` / `input` / `ring` | `rule` / `line-control` / `cta` |
| `background`, `card`, `popover` | `paper` |

Regras para manter o tema íntegro:

- Use as classes do design system (`bg-cta`, `text-info-text`) e as do shadcn (`bg-primary`) só dentro dos componentes do shadcn. Não escreva cores em hexadecimal nos componentes.
- Ao instalar um componente do shadcn (`npx shadcn@latest add ...`), ajuste raios, alturas e padding para os valores do `.md` correspondente (por exemplo, botão de 36px com `rounded-md`).
- Ícones: `lucide-react`, com os mesmos nomes listados no README abaixo.
- Mudou um valor? Atualize o `tokens.json` e o `globals.css` juntos.

---

Nexo Assist é o atendimento de TI da Nexo em formato de chat: o funcionário conversa com o assistente, e o analista do service desk acompanha e assume as conversas por um console. A interface é clara, densa e objetiva, feita para ser lida rápido. A única voz expressiva é a serifada do login.

## Conteúdo e voz

- Escreva em português do Brasil, tratando a pessoa por **você**. O assistente fala em primeira pessoa: "Vou abrir um chamado.", "Confira antes de eu criar:".
- Use frases curtas, em sentence case: "Meu perfil", "Esqueci minha senha", "Assumir atendimento". Nunca use caixa alta em rótulos.
- Comece botões com verbo e diga o que acontece: "Confirmar", "Editar", "Devolver ao agent", "Encerrar atendimento".
- Descreva as ações do agent no passado, em minúsculas, como uma trilha: "consultou seus chamados", "buscou na central de ajuda", "classificou a prioridade", "montou o rascunho".
- Separe metadados com " · ": "Rede e VPN · Alta · em até 4 h", "INC-20298 · Em andamento", "online · Financeiro · INC-20311".
- Escreva os números de chamado assim: `INC-20311` (incidente) e `REQ-10442` (requisição). Prazos em linguagem de service desk: "em até 4 h úteis", "resposta até 13:43", "prazo vencido". Datas curtas: "16 out", "16 out, 14:20".
- Sem emoji e sem pontos de exclamação na interface. A exceção é uma mensagem escrita por um analista humano.

## Cor

- Monte a tela sobre `paper`. Use `desk` para superfícies de apoio (rail, barra de ações do rascunho, busca e filtros, item selecionado) e `thread` só para o fundo das mensagens no console.
- Texto principal em `ink`, secundário em `ink-2` e metadados em `ink-3`. Os três leem bem em `paper`, `desk`, `thread`, `bubble-agent` e `bubble-analyst`.
- `cta` é a cor de ação: no máximo um botão principal por região (Entrar, Confirmar, Enviar, Assumir atendimento). Ela também marca o checkbox, o radio selecionado, a borda do input em foco e os contadores de não lidas. O texto sobre `cta` é sempre `on-ink`.
- `info` é marca de estado, nunca texto: ponto de "Em andamento", ticks de lida, borda da opção rápida escolhida. Texto azul é `info-text`, sobre `paper` ou `info-soft`.
- Status sempre aparece com ponto **e** palavra, nunca só pela cor: aguardando = `warning` / `warning-text`; em andamento = `info`; aprovado, online = `success` / `success-text`; transferida = `danger` / `danger-text`; resolvido = `dot-neutral`. Pílulas usam o fundo `*-soft` com o texto `*-text` do mesmo tom.
- No chat do funcionário, a bolha do funcionário é `ink` com texto `on-ink`, e a do agent é `paper` com borda `rule`. No console, o cliente fica em `paper`, o agent em `bubble-agent` e o analista em `bubble-analyst`.
- Avatares usam os pares `avatar-*-bg` / `avatar-*-fg`, escolhidos por pessoa e mantidos em todas as telas. O usuário logado usa `info-soft` com `info-text`.
- O painel escuro do login é `ink`, com texto `on-ink` / `on-ink-muted` e divisórias `on-ink-rule`. O card de prévia usa `on-ink-surface`.

## Tipografia

- Toda a interface usa **Schibsted Grotesk** (`ui`). **Newsreader** (`display`) aparece só no login: `display-xl` no título do painel, `display-lg` em "Entrar" e `display-md` nos números. Não use a serifada dentro do produto logado.
- O texto de leitura é `body` (14,5px / 1,45): mensagens, valores de input, campos do chamado. Rótulos, botões e navegação usam `label` (13,5px / 500). Metadados e a trilha do agent usam `caption` (12,5px).
- Títulos de card de chamado usam `card-title`. Colunas do console usam `panel-title`, e páginas usam `page-title`.
- O protótipo usa meios pixels (14,5, 13,5, 12,5, 11,5). Mantenha esses valores, sem arredondar.

## Espaço, forma e profundidade

- Os espaçamentos são os do protótipo (`space-2` a `space-64`). Os mais comuns: `space-6` entre opções, `space-8` entre rótulo e input, `space-12` e `space-14` de padding horizontal, `space-20` entre mensagens.
- Raios: botões, inputs e opções em `radius-md`; bolhas e composer em `radius-lg`, com **um** canto em `radius-xs` apontando para quem fala (superior esquerdo no agent, inferior direito no funcionário; no console, superior esquerdo no cliente e superior direito no agent e no analista); cards elevados em `radius-xl`; pílulas, filtros, busca e avatares em `radius-pill`.
- A profundidade é discreta. Cards de chamado, rascunho e seletor têm borda `line-card` + `shadow-card`. Inputs têm `line-control` + `shadow-xs`. Botões secundários têm `line-control` + `shadow-sm`. Bolhas do console usam `shadow-bubble`. Só o botão Entrar usa `shadow-cta`.
- Separe regiões com uma linha de 1px em `rule`, nunca com sombra: barra lateral, barra superior, cabeçalhos de coluna, linhas de lista.
- Layout desktop: barra lateral `sidebar-width`; console com `rail-width`, `list-width` e `panel-width`; barras superiores com `topbar-height`. A coluna de mensagens do funcionário tem margens `chat-gutter`, e a bolha do agent tem `agent-bubble-width`.

## Estados

- Foco de input: borda de 1,5px em `cta`, com o ícone do campo em `info-text`.
- Foco de teclado em botões e opções: anel sólido de 2px em `cta`, com 2px de afastamento. O protótipo não desenha esse estado; ele foi adicionado aqui (ver Adições intencionais).
- Opção rápida selecionada: fundo `info-soft`, borda `info` e texto `info-text`.
- Item de navegação ativo: fundo `info-soft`, ícone e texto `info-text`, peso 600.
- Item de conversa selecionado: fundo `desk`.
- Composer bloqueado (agent com o analista ou conversa aguardando): fundo `desk` com opacidade 0,55 e texto explicando o que fazer ("Assuma o atendimento para responder").

## Iconografia

- Ícones da biblioteca **Lucide**, em traço de 2px com pontas arredondadas, herdando a cor do texto. Tamanhos: 12px na trilha do agent, 14–16px em botões e campos, 18–19px em botões só de ícone.
- O grupo Icons traz os 25 ícones usados nas telas. Em código, use o pacote `lucide-react` com os mesmos nomes (`message-square`, `user-round`, `check-check`, `headset`, `bot`, `arrow-right-left`...).
- Cada ícone tem um significado fixo: `check` = ação concluída pelo agent; `check-check` = mensagem lida; `bot` = agent / devolver ao agent; `headset` = analista / assumir; `arrow-right-left` = transferência; `hand` = esperando atendimento.
- O símbolo Nexo (grupo Logos) aparece ao lado de "Nexo Assist" em `brand`: azul (`mark`) sobre fundos claros e branco sobre `ink`.

## Componentes

Os componentes ficam em `window.NexoAssist` e precisam do React 18 na página. Siga as diretrizes de cada um no seu card.

- **Chat do funcionário:** `SidebarNav` + `TopBar` + coluna de mensagens com `UserMessage` e `AgentMessage`. As respostas podem trazer `TicketSelector` ou `TicketCard` como `attachment`, e o `Composer` fica no pé.
- **Console do analista:** `RailItem` no rail; coluna com `SearchField`, `FilterChips` e `ConversationItem`; conversa em `thread` com `ConsoleMessage` e `SystemEvent`, e `TakeoverBar` no pé enquanto ninguém assumiu; painel lateral com `CurrentTicket` e `TicketListItem`.
- **Login:** `TextField`, `Checkbox` e `Button` `size="md"`. **Meu perfil:** `ProfileCard`.
- O símbolo está disponível como `NexoAssist.Mark` (herda `color`; use `mark` sobre fundos claros).

## Adições intencionais

- Anel de foco de teclado em `cta` (o protótipo só mostra o foco de input).
- Checkbox desmarcado com borda `line-radio` em `paper` (o protótipo só mostra o marcado).
- Hover do botão primário em `info-hover`.
- Erro de campo no `TextField`: borda `danger`, ícone e mensagem em `danger-text`.
- Faixa de erro do login: `danger-soft` com `danger-text` e `radius-md`.
- Estado de envio do botão: só troca o rótulo ("Entrando") e tira a seta.
- Chat vazio: nenhum estado vazio está definido no protótipo. A área da conversa fica em branco, sem conteúdo de exemplo, e o composer mostra "0/30 mensagens nesta sessão".
- `profile-width`: coluna da página Meu perfil, medida em `screens/06-meu-perfil.png`.
- `on-ink-surface`, `login-form-width` e `login-preview-width`: valores medidos em `screens/01-login.png`. A borda do card de prévia e a bolha do agent reaproveitam `on-ink-rule`.

## Não sincronizado

As notas de uso descrevem o uso que aparece nas telas do arquivo `nexo.pen`.

- **Variáveis sem uso:** o arquivo também traz um conjunto de variáveis que nenhuma tela usa (`bg`, `surface`, `card`, `card-strong`, `fg`, `muted`, `subtle`, `border`, `border-strong`, `violet`, `violet-soft`, `violet-text`, `radius-sm` 6, `radius-md` 10, `radius-lg` 14, fontes Geist, Geist Mono e IBM Plex Mono). Ficaram de fora.
- **Tema escuro:** o arquivo só tem o tema claro.
- **Fontes:** Newsreader e Schibsted Grotesk vêm do Google Fonts, sem arquivos próprios.
- **Estados de hover e erro:** nenhuma tela desenha hover, desabilitado ou erro de campo.
- **Contraste:** os pontos de status `warning` e `success` sozinhos ficam abaixo de 3:1 em `paper`, por isso sempre vêm com texto. `line-control` e `rule` são bordas de 1,2–1,3:1. `avatar-green-fg` sobre `avatar-green-bg` fica em 4,48:1.
