# TextField

Campo de texto com rótulo acima e ícone à esquerda, como no login. O foco troca a borda para 1,5px em `cta` e pinta o ícone em `info-text`.

- O consumidor fornece `label`, o `icon` (Lucide: `mail`, `lock-keyhole`) e as props normais de `<input>` (`value`, `onChange`, `placeholder`, `type`, `name`, `autoComplete`).
- `labelAction` mostra uma ação à direita do rótulo ("Esqueci minha senha"). No código, ela recebe qualquer elemento; a referência em JavaScript ainda usa `link` / `linkHref`.
- Com `type="password"`, o campo ganha o botão de mostrar/ocultar (`eye`, o mesmo ícone nos dois estados, com `aria-pressed`) e espaçamento de 2px entre os caracteres enquanto a senha está oculta.
- Escreva o rótulo como substantivo, em sentence case: "E-mail corporativo", "Senha". 
- `error` mostra a mensagem abaixo do campo, com borda `danger` e ícone em `danger-text`, e liga o campo à mensagem com `aria-invalid` e `aria-describedby`. O protótipo não desenha esse estado (ver Adições intencionais).
