# TicketCard

Card elevado de um chamado, usado no chat em dois momentos: **rascunho** para confirmar antes de criar e **chamado** consultado.

- Rascunho: `kind="Novo chamado"`, `number="Rascunho D-381"`, `status={tone:'warning', label:'Aguardando confirmação'}` e `actions` com Confirmar (primary, `kbd="⌘↵"`), Editar (secondary) e Cancelar (ghost). Nada é criado antes do Confirmar.
- Chamado: `kind="Chamado"`, `number="INC-20311"` e o status atual, sem `actions`.
- `fields` monta a grade abaixo da linha `rule`: Categoria, Prioridade (com `dot` do tom e `note` "· resposta até 13:43"), Afetados, Aberto em, Última atualização (`tone:'warning'` + `note` "· prazo vencido" quando vencido).
- O chamado consultado no chat usa Categoria, Prioridade, Aberto em e Prazo. Prazo vencido usa `tone:'warning'` + `note` "· prazo vencido". Sem data de prazo, o campo some. Em telas estreitas, a grade tem duas colunas.
- Ponto da prioridade: crítica = `danger`, alta = `warning`, média = `medium`, baixa = `neutral`.
- O título usa `card-title` e a descrição `small` em `ink-2`. Mantenha o título curto e específico: "VPN não conecta no notebook — erro 809".
