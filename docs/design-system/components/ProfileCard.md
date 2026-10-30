# ProfileCard

Card da página Meu perfil, em dois formatos: lista de dados (`rows`) e ação com ícone (`action`), com uma faixa de ajuda opcional (`helper`).

- `rows`: `label`, `value` e, se o dado não puder ser editado, `note` + `noteIcon="lock"` ("Gerenciado pela TI").
- `action`: `icon`, `title`, `meta`, `button`, `buttonIcon`, `onClick` (Senha · "Alterada há 42 dias" · Redefinir senha).
- `helper` explica o que acontece depois da ação ("Enviaremos um link de redefinição para…").
