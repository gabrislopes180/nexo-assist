# ArticleCard

Artigo da central de ajuda citado pelo agent. Fica logo abaixo da bolha do `AgentMessage` (slot `sources`, antes do `attachment`) e abre o texto completo ali mesmo, sem sair da conversa.

- Origem: `trace.sources` da mensagem do agent (`[{ kind: "ARTICLE", slug, title }]`). Vale no `POST /chat`, no SSE `message.created` e na `GET /chat/conversations/:id`, então o card volta depois de recarregar a página. Fonte de tipo desconhecido ou fora do formato não vira card; a mensagem fica.
- Com o card, a frase "Fonte: <título> (central de ajuda)." que o backend acrescenta ao fim da resposta não aparece na bolha: quem mostra a fonte é o card. Só sai do fim do texto e só em resposta com fonte.
- Card fechado: linha `caption` `ink-3` com o ícone `book-open` (12px) e "Central de ajuda", separada da categoria por um ponto `rule` ("Central de ajuda · Rede e VPN"); abaixo, o título em `heading` `ink`. À direita, "Ler artigo" com `chevron-down` em `caption` `ink-2`.
- Superfície: `paper`, borda `line-card`, `radius-xl`, largura até `agent-bubble-width`. Sem `shadow-card`: o artigo é material de consulta, não uma ação como o rascunho ou o chamado.
- O cabeçalho inteiro é um botão (`aria-expanded`, `aria-controls`), com hover `desk` e anel de foco `cta` por dentro do card. Abrir mantém o foco no botão; o chevron gira 180° (só com movimento permitido) e o rótulo vira "Recolher".
- Aberto: linha `rule` e o texto do artigo em `body` `ink`, como texto puro com as quebras de linha preservadas (nunca HTML). No pé, "Atualizado em 16 out" em `caption` `ink-3` e "Recolher artigo" (ghost), que fecha e devolve o foco ao cabeçalho.
- O artigo é buscado (`GET /help/articles/:slug`) assim que o card aparece, para a categoria entrar no card fechado e o texto abrir sem espera. Sem o artigo, o card fechado mostra só "Central de ajuda" e o título.

## Estados

- **Carregando:** `StatusBadge` `info` pulsante "Carregando artigo…".
- **Removido (404):** "Este artigo não está mais na central de ajuda." em `caption` `danger-text`, sem "Tentar de novo".
- **Central indisponível (503):** "A central de ajuda está indisponível agora." com "Tentar de novo" (secondary). Durante a nova tentativa, o botão fica com `aria-disabled` e o rótulo "Tentando de novo".
- **Outras falhas:** "Não foi possível carregar o artigo." com "Tentar de novo". Sessão expirada (401): "Sua sessão expirou. Entre de novo para ler o artigo.", sem repetir.
- **Sem texto:** "Este artigo está sem texto na central de ajuda." em `caption` `ink-3`.
- Carregando e falha são anunciados por uma região `role="status"` sempre montada, fora do corpo escondido; o texto do artigo não é anunciado. Quando "Tentar de novo" dá certo, o foco vai para o texto aberto.
- Se a busca falhou com o card fechado, abrir o card tenta de novo.
