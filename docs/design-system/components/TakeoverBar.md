# TakeoverBar

Barra no pé da conversa quando ela está aguardando um analista: explica a situação e oferece Devolver ao agent e Assumir atendimento, com o composer bloqueado embaixo.

- O consumidor fornece `title` ("Ana espera um atendente"), `detail` ("Agent pausado · até 12:05"), `onReturn` e `onTakeover`.
- Depois de assumir, troque a barra pelo `Composer` `variant="console"` e coloque Devolver ao agent e Encerrar atendimento no cabeçalho.
