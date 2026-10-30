# TicketSelector

Lista de seleção dos chamados do funcionário, mostrada abaixo da resposta do agent quando ele tem mais de um chamado aberto ("Sobre qual deles quer saber?").

- O consumidor fornece `tickets` (`number`, `title`, `status` {tone, label}, `date`) e `value` / `onChange(number)`.
- A linha escolhida fica em `row-selected`, com o radio em anel de 5px `cta`. A escolha vira a próxima mensagem do funcionário ("INC-20311 · Notebook lento após atualização").
- Mostre só chamados da própria pessoa.
