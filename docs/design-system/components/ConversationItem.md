# ConversationItem

Linha da lista de conversas do console: avatar, nome, horário, última mensagem e uma marcação de situação.

- Com `unread`, o nome fica em 600, o horário em `cta` e aparece o contador. `selected` pinta o fundo de `desk`.
- `tag` diz em que pé está a conversa: `danger` "Transferida · INC-20311", `warning` "Agent pediu ajuda · confiança 41%", `success` "Agent atendendo", `resolved` "Resolvida pelo agent", `info` "Você está atendendo".
- `read` mostra `check-check` antes da prévia (última mensagem foi do agent, já lida). `typing` troca a prévia por "digitando…".
