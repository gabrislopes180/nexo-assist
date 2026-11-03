# Composer

Campo de escrever mensagem. **chat** (padrão): caixa de 48px com botão Enviar e o contador de mensagens da conversa. **console**: campo em `desk` com botão redondo, para o analista.

- O consumidor fornece `onSend(texto)`, e no chat `count` + `max` (o limite é 30 por conversa: "18/30 mensagens nesta conversa"). O contador só muda quando a resposta chega.
- `reference/`, as telas e as amostras de `tokens.json` ainda dizem "nesta sessão". O texto válido é "nesta conversa", porque o limite pertence à conversa.
- `locked` bloqueia o campo (opacidade 0,55) e troca o placeholder por uma instrução: "Assuma o atendimento para responder". Use quando a conversa não estiver com quem vê a tela.
- Placeholder padrão: "Escreva para o Nexo…".

## Console (`variant="console"`)

- Campo em `desk` com `radius-lg`, altura `control-lg`, e botão redondo `control-lg` `radius-pill` em `cta` com `send-horizontal` de 18px e `aria-label="Enviar"`. Placeholder "Escreva para {primeiro nome}…".
- **Ocupado:** o campo continua editável; o botão fica com `aria-disabled` e `aria-busy` e troca o ícone por um indicador girando (parado com movimento reduzido). Enter é recusado sem apagar o texto.
- O texto só é limpo quando a resposta foi gravada; num erro ele fica, e a linha de erro aparece acima do composer em `caption` `danger-text`.
- **Mensagem longa:** acima de 2.000 caracteres, borda `danger` e a linha "Sua mensagem passou do limite de 2.000 caracteres." em `caption` `danger-text`.

## Estados do chat

- **Ocupado:** o campo continua editável, para a pessoa escrever a próxima mensagem. O botão mostra "Enviando", sem a seta, com `aria-disabled` e `aria-busy`. Enter é recusado sem apagar o texto.
- **Com analista:** o composer continua ativo e sem contador (com analista não há cota). No lugar do contador fica um aviso neutro em `small` `ink-2`, com `role="status"`: "Um analista vai continuar o atendimento por aqui." enquanto espera e "Rafael Lima está atendendo você por aqui." depois que alguém assume. O placeholder vira "Escreva para o analista…". O aviso quebra linha em telas estreitas.
- **Bloqueado:** quando a conversa chega ao limite com o agent ou é encerrada. A caixa fica em `desk` com opacidade 0,55, com o placeholder "Inicie uma nova conversa para continuar". Abaixo dela, a 100% de opacidade e no lugar do contador, ficam o aviso em `small` `ink-2` e o botão secundário "Iniciar nova conversa". O tom é neutro: bloqueio não é erro.
- **Mensagem longa:** acima de 2.000 caracteres, o texto fica, a caixa ganha borda `danger` e o erro aparece em `caption` `danger-text`, à esquerda do contador. Some ao editar.
