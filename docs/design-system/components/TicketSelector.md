# TicketSelector

Lista de seleção dos chamados do funcionário, mostrada abaixo da resposta do agent quando ele tem mais de um chamado aberto ("Sobre qual deles quer saber?").

- O consumidor fornece `tickets` (`number`, `title`, `status` {tone, label}, `date`) e `value` / `onChange(number)`.
- A linha escolhida fica em `row-selected`, com o radio em anel de 5px `cta`. A escolha vira a próxima mensagem do funcionário ("INC-20311 · Notebook lento após atualização").
- Mostre só chamados da própria pessoa.
- Começa sem seleção: a escolha é da pessoa e gasta uma mensagem da conversa. Por isso as setas só movem o foco; Espaço e Enter escolhem.
- Depois de escolhido, ou quando já não é a última resposta, o seletor fica só leitura: `aria-disabled`, sem hover e sem reduzir a opacidade, porque continua sendo parte legível da conversa.
- Se houver mais resultados do que linhas, mostre abaixo, em `caption` `ink-3`: "Mostrando 5 de 7 chamados".
