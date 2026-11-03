# AnalystMessage

Mensagem do analista no chat do funcionário. Tem a forma do `AgentMessage` (à esquerda, bolha `paper`, borda `rule`, canto superior esquerdo em `radius-xs`, largura `agent-bubble-width`), sem trilha de ações: quem fala é uma pessoa.

- O consumidor fornece `authorName` (o nome que vem do backend) e `children` (texto puro, nunca HTML).
- Acima da bolha, o nome em `caption-strong` `ink` e um `StatusBadge` `variant="tag"` `tone="success"` com "Analista", o mesmo par de tag usado pelo `ConsoleMessage` para o analista.
- O leitor de tela ouve "Rafael Lima: …" por um `sr-only` no começo do texto; o cabeçalho visível fica `aria-hidden` para não repetir.
- Sem token novo. Sem nome (autor removido no backend), o rótulo é "Analista".
- Marcos da troca de quem atende ("Rafael assumiu a conversa", "Conversa devolvida ao agent", "Rafael encerrou o atendimento") ficam no `SystemEvent`, não aqui.
