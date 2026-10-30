# Composer

Campo de escrever mensagem. **chat** (padrão): caixa de 48px com botão Enviar e o contador de mensagens da sessão. **console**: campo em `desk` com botão redondo, para o analista.

- O consumidor fornece `onSend(texto)`, e no chat `count` + `max` (o limite é 30 por sessão: "18/30 mensagens nesta sessão").
- `locked` bloqueia o campo (opacidade 0,55) e troca o placeholder por uma instrução: "Assuma o atendimento para responder". Use quando a conversa não estiver com quem vê a tela.
- Placeholder padrão: "Escreva para o Nexo…".
