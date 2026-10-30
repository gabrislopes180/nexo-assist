# StatusBadge

Status sempre com ponto **e** palavra, em três formatos: `dot` em linhas e cards, `pill` em cabeçalhos e `tag` ao lado do nome do remetente.

- Tons: `warning` = aguardando (analista, confirmação, atendente); `info` = em andamento; `success` = aprovado, online, disponível; `danger` = transferida; `neutral` = resolvido ou encerrado; `medium` = ponto da prioridade média.
- `dot` usa texto `ink-3`. Com `strong`, o texto fica na cor do tom e com peso 500 (status no topo do card de chamado).
- `pill` usa o fundo `*-soft` com o texto `*-text`: "Assistente online", "Disponível", e "Aguardando atendente" com `icon="bot"`.
- `tag` identifica quem escreveu no console: "IA" (`info`) e a equipe do analista, como "Suporte N2" (`success`).
- O consumidor fornece `tone` e o texto. Nunca use só o ponto, sem palavra.
