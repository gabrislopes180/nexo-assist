# Button

Botão de ação, com rótulo começando por verbo. Use **primary** (`cta`) uma vez por região, para a ação principal: Entrar, Confirmar, Enviar, Assumir atendimento.

- `size="md"` (44px, `shadow-cta`) só no formulário de login. Todo o resto usa `size="sm"` (36px).
- **secondary** é a alternativa ao lado do principal (Editar, Devolver ao agent, Redefinir senha); **ghost** é a saída discreta (Cancelar); **danger** é só para Encerrar atendimento.
- O consumidor fornece o rótulo (`children`), `onClick` e, se quiser, `icon` / `iconRight` (nomes Lucide) e `kbd` com o atalho ("⌘↵").
- Não use dois primary lado a lado nem ícone sem rótulo neste componente.
