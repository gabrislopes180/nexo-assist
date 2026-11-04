# AgentMessage

Resposta do Nexo Assist com a trilha de ações acima da bolha. É a peça central da transparência: o funcionário vê o que o agent fez antes de ler a resposta.

- `actions` lista o que o agent fez naquele turno, no passado e em minúsculas, cada item com um `check`: "consultou seus chamados", "classificou a prioridade", "calculou o prazo". Mostre só ações que realmente aconteceram.
- Passo com falha usa o ícone `x` e `danger-text`, com o texto dizendo o que não deu certo: "não conseguiu consultar seus chamados".
- `children` é a resposta (bolha `paper`, borda `rule`, canto superior esquerdo em `radius-xs`, largura `agent-bubble-width`).
- `question` + `options` viram opções rápidas: a escolhida fica com fundo `info-soft`, borda `info` e texto `info-text`. Use `selected` / `onSelect` para controlar de fora.
- No chat, escolher uma opção envia o texto dela como mensagem e gasta uma mensagem da conversa. Depois disso, ou quando não é mais a última resposta, as opções ficam só leitura (`aria-disabled`, sem hover, sem perder opacidade). A pergunta vem no fim do texto da resposta: quando há opções, a última linha terminada em "?" aparece separada, em `body` com peso 600.
- Trilha de rascunho: "classificou a prioridade", "consultou o SLA", "montou o rascunho" (criação) ou só "montou o rascunho" (complemento). Na reabertura, "consultou seus chamados" e "montou o rascunho". Depois de confirmar: "criou o chamado", "registrou o complemento" ou "reabriu o chamado".
- Trilha da central de ajuda: "buscou na central de ajuda" (ou "não conseguiu buscar na central de ajuda").
- `sources` coloca os cards dos artigos citados (`ArticleCard`) logo abaixo da bolha, antes do `attachment`. Com artigo citado, a frase "Fonte: … (central de ajuda)." do fim da resposta não aparece na bolha, e as opções rápidas são "Resolveu, obrigado" e "Não resolveu, abrir chamado".
- `attachment` coloca um card logo abaixo da bolha (TicketCard do rascunho ou do chamado consultado).
- Detalhes do raciocínio (confiança, motivo) não entram na bolha. Ficam num detalhe expansível ou painel ao lado.
