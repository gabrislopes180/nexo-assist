# TicketCard

Card elevado de um chamado, usado no chat em dois momentos: **rascunho** para confirmar antes de criar e **chamado** consultado.

- Rascunho de criação: `kind="Novo chamado"`, `number="Rascunho"` (sem número: ele só existe depois de confirmar), `status={tone:'warning', label:'Aguardando confirmação'}`, descrição e `actions` com Confirmar (primary, `kbd="⌘↵"`), Editar (secondary) e Cancelar (ghost). Nada é criado antes do Confirmar.
- Rascunho de complemento: `kind="Complemento"`, `number` com o código do chamado, o título do chamado e, como descrição, o texto que será acrescentado. A grade é a do chamado.
- Chamado: `kind="Chamado"`, `number="INC-20311"` e o status atual, sem `actions`.
- `fields` monta a grade abaixo da linha `rule`: Categoria, Prioridade (com `dot` do tom e `note` "· resposta até 13:43"), Afetados, Aberto em, Última atualização (`tone:'warning'` + `note` "· prazo vencido" quando vencido).
- No rascunho de criação, a grade é Categoria, Prioridade com o prazo previsto ("· resposta até 13:43"; em outro dia, "· resposta até 22 out, 09:00") e Afetados ("Somente você", "Sua equipe", "Toda a empresa").
- O chamado consultado no chat usa Categoria, Prioridade, Aberto em e Prazo. Prazo vencido usa `tone:'warning'` + `note` "· prazo vencido". Sem data de prazo, o campo some. Em telas estreitas, a grade tem duas colunas.
- Ponto da prioridade: crítica = `danger`, alta = `warning`, média = `medium`, baixa = `neutral`.
- O título usa `card-title` e a descrição `small` em `ink-2`. Mantenha o título curto e específico: "VPN não conecta no notebook — erro 809".

## Estados do rascunho

- **Editar** troca o corpo do card por campos (`TextField` para o título, `TextArea` para descrição ou complemento, opções de Afetados no estilo da opção rápida) e a barra por Salvar (primary) e Descartar alterações (ghost). Tipo, categoria e prioridade não são editáveis. Salvar não grava nada: só volta ao rascunho com o texto novo. Limites: título 120, descrição e complemento 2.000 caracteres, com erro no próprio campo.
- **Confirmando / Cancelando:** o botão da ação troca o rótulo e os outros ficam `aria-disabled`. Um clique por vez.
- **Falha:** linha em `caption` `danger-text` abaixo da barra, dentro do card, com "Tentar de novo" (secondary) quando repetir faz sentido. O rascunho continua pendente.
- **Depois:** sem a barra de ações, com o status do rascunho: Confirmado (`success`), Cancelado, Substituído (um rascunho mais novo chegou) ou Indisponível (`neutral`). O chamado criado ou atualizado aparece num card próprio, abaixo da mensagem do agent.
- O atalho Confirmar funciona com ⌘↵ ou Ctrl+↵ com o foco dentro do card. O rótulo mostra "⌘↵" no Mac e "Ctrl ↵" nos outros sistemas. O fundo do atalho sobre `cta` reaproveita `on-ink-rule` (10% contra 14% da referência).
