# ConsoleMessage

Mensagem no console do analista, sobre `thread`. O cliente fica à esquerda em `paper`; o agent (tag IA, `bubble-agent`) e o analista (tag da equipe, `bubble-analyst`) ficam à direita.

- O consumidor fornece `from` (`client` / `agent` / `analyst`), `children`, `time` e, para analista, `name` + `team` ("Suporte N2").
- Mensagens do agent e do analista mostram `check-check` em `info` quando lidas (`read={false}` esconde).
- `long` fixa a largura em 420px e põe o horário numa linha própria, para textos longos.
