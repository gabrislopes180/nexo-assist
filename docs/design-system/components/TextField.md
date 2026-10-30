# TextField

Campo de texto com rótulo acima e ícone à esquerda, como no login. O foco troca a borda para 1,5px em `cta` e pinta o ícone em `info-text`.

- O consumidor fornece `label`, o `icon` (Lucide: `mail`, `lock-keyhole`) e as props normais de `<input>` (`value`, `onChange`, `placeholder`, `type`, `name`, `autoComplete`).
- `link` mostra uma ação à direita do rótulo ("Esqueci minha senha").
- Com `type="password"`, o campo ganha o botão de mostrar/ocultar (`eye`) e espaçamento de 2px entre os caracteres.
- Escreva o rótulo como substantivo, em sentence case: "E-mail corporativo", "Senha". O protótipo não tem estado de erro.
