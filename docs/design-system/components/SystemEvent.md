# SystemEvent

Marco no meio da conversa do console: uma linha com o evento ("Transferida para Suporte N2 · 10:05", "Rafael Lima assumiu · agent pausado · 10:12") ou a pílula de data (`variant="day"`, "Hoje").

- O consumidor fornece o texto e o `icon`: `arrow-right-left` para transferência, `headset` para quando o analista assume, `bot` para quando a conversa volta ao agent. O encerramento fica sem ícone.
- O ícone sai do `systemKind` da mensagem (`HANDOFF`, `TAKEOVER`, `RETURNED`, `CLOSED`), nunca do texto, que é só para exibir.
- Registre aqui toda troca de quem atende, para o histórico ficar legível.
- No chat do funcionário, a transferência aparece como "Transferida para um analista · 14:20" (`arrow-right-left`), logo depois da resposta que transferiu. O texto usa `caption` com peso 500: a referência usa 12px, que não tem token.
