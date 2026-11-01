# AgentMessage

Resposta do Nexo Assist com a trilha de ações acima da bolha. É a peça central da transparência: o funcionário vê o que o agent fez antes de ler a resposta.

- `actions` lista o que o agent fez naquele turno, no passado e em minúsculas, cada item com um `check`: "consultou seus chamados", "classificou a prioridade", "calculou o prazo". Mostre só ações que realmente aconteceram.
- Passo com falha usa o ícone `x` e `danger-text`, com o texto dizendo o que não deu certo: "não conseguiu consultar seus chamados".
- `children` é a resposta (bolha `paper`, borda `rule`, canto superior esquerdo em `radius-xs`, largura `agent-bubble-width`).
- `question` + `options` viram opções rápidas: a escolhida fica com fundo `info-soft`, borda `info` e texto `info-text`. Use `selected` / `onSelect` para controlar de fora.
- `attachment` coloca um card logo abaixo da bolha (TicketCard do rascunho ou do chamado consultado).
- Detalhes do raciocínio (confiança, motivo) não entram na bolha. Ficam num detalhe expansível ou painel ao lado.
