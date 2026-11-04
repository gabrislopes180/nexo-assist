# Nexo Assist — contexto para auditoria final com Codex

**Data de referência:** 04/11/2026  
**Finalidade:** transferir o contexto da conversa para o Codex no VS Code e orientar uma **auditoria somente leitura** do repositório antes de decidir alterações pré-deploy.

> **Princípio orientador:** este é um desafio técnico de processo seletivo, não a implantação corporativa real de um service desk para 2.000 pessoas. Priorizar aderência ao PRD, demonstração confiável, clareza técnica, segurança básica e baixo custo. Não introduzir complexidade de escala sem justificativa.

## 1. Materiais de referência e grau de confiança

Este documento foi elaborado a partir de três materiais fornecidos pelo candidato e da discussão sobre eles:

1. `Desafio_Tecnico_Nexo_Assist_PRD_v5.pdf` — **fonte de verdade dos requisitos do desafio**.
2. `nexo-assist-pre-deploy(1).md` — checklist técnico gerado anteriormente por IA, com estado relatado em **03/11/2026**; **não presumir que ainda está atualizado**.
3. `verificações de necessidade.txt` — comentários do candidato sobre o que simplificar ou excluir.

**Importante:** nenhuma auditoria do código-fonte foi realizada nesta conversa. Toda descrição de implementação atual é um **relato do checklist**, a confirmar no repositório. As prioridades abaixo são **hipóteses de trabalho**, não decisões finais.

## 2. O que o PRD efetivamente pede

### Objetivo

Agent de service desk de TI que conversa com funcionários, consulta seus chamados e a central de ajuda, cria/atualiza chamados, transfere casos para analistas quando necessário e mostra de forma compreensível o que decidiu e por quê.

### Funcionalidades

- Login visual com **e-mail corporativo e senha**, aceitando **qualquer senha** para usuários dos dados de exemplo. Não é exigido SSO nem autenticação corporativa real.
- Chat com respostas em tempo real, cards e seleção de chamados, rascunho para confirmação, perguntas com opções rápidas e **limite de 30 mensagens por sessão**.
- Agent seguindo as regras do Anexo A, usando central de ajuda e serviço de chamados.
- Serviço de chamados **simulado e separado do agent**, com consulta, criação, atualização e transferência.
- Transferência: conversa fica aguardando analista e o agent deixa de responder enquanto não for liberado.
- Console do analista: fila/filtros/status, histórico, assumir, devolver ao agent, encerrar e ver chamados do funcionário.
- **Transparência das decisões é descrita como a parte mais importante:** mostrar ações realizadas, entendimento, ação, grau de segurança e justificativa, em formato legível.
- História explícita do funcionário: **voltar outro dia e continuar de onde parou**.

### Requisitos técnicos

- TypeScript com tipagem estrita.
- Mastra (preferido) ou LangGraph.js.
- Provedor LLM livre, com escolha explicada no README.
- Interface alinhada ao protótipo do Anexo C.
- **Persistência após reinício:** conversas, chamados e estado da conversa (agent/analista).
- Execução local com poucos comandos, documentados, e `.env.example`.
- Arquitetura separando interface, agent e serviços; testes relevantes, tratamento de erros e commits claros.
- Uso consciente de tokens/custos; chaves fora do código; chamados de um funcionário não expostos a outro.

### Regras do service desk (Anexo A)

- Tipos: incidente (INC) e requisição (REQ).
- Categorias: Acesso, Rede e VPN, Hardware, Software, E-mail e Outros.
- Abertura exige título, descrição, tipo, categoria, prioridade e pessoa afetada; **confirmar rascunho antes de criar ou atualizar**.
- Evitar duplicidade; reabrir resolvidos há até 7 dias quando aplicável.
- Transferir a pedido, em casos críticos, vencidos ou de baixa confiança, levando resumo; agent pausado.
- Privacidade: dados do chamado apenas para quem o abriu.
- Escopo apenas TI; RH, financeiro e facilities são redirecionados.
- Prazos: crítica 1 hora; alta 4 horas úteis; média 3 dias úteis; baixa 5 dias úteis.

### Dados de exemplo

Funcionários, **5 a 10 artigos** de ajuda e chamados variados (abertos, vencidos, resolvidos recentemente e de outros funcionários). Dados fictícios são apropriados ao desafio.

### Avaliação e entrega

- Critérios: qualidade das decisões, condução da conversa, transparência, interface, arquitetura/boas práticas e README.
- Entregar link do GitHub e README explicando execução, arquitetura, decisões do agent, garantia de qualidade, trade-offs e próximos passos.
- **Deploy é diferencial, não obrigatório**, mas, se publicado, o PRD pede proteger chaves, limitar uso para evitar abuso/custo inesperado e documentar deploy.
- Na entrevista haverá conversa sobre o código e possibilidade de **pequenas mudanças ao vivo**. Evitar soluções que o candidato não consiga explicar.

## 3. Estado do projeto relatado no checklist de 03/11 (VERIFICAR)

Stack relatada: frontend **Next.js 16**, backend **Express**, agent **Mastra**, **Prisma + SQLite/libSQL**, proxy `/api/*` via Next, **SSE** com barramento em memória.

- Último commit mencionado: `ff57c97`; trabalho de 02 e 03/11 ainda não commitado na data do relatório.
- Mudanças relatadas no working tree: console real do analista e SSE, gestão de chamados, central de ajuda, encaminhamento fora de escopo, correções, migrations `20261103041350_console_attendance` e `20261103212436_message_system_kind`.
- Pastas de memória de agentes listadas para excluir **do versionamento** (inspecionar antes de remover qualquer arquivo): `docs/architecture/.claude/`, `backend/.claude/agent-memory/`, `frontend/.claude/agent-memory/`.
- Frontend teria **473 testes**; número e estado devem ser verificados.
- Card de artigo no chat do funcionário relatado como pronto, mas sem teste no navegador; nota `Fonte: ...` ainda apareceria no console do analista (possível uso de `strip-source-note` em `console-timeline`).
- Busca da central em relatos de problema estava em andamento.
- Fluxos de gestão de chamados, fora de escopo e central de ajuda não haviam sido testados no navegador; console/SSE já haviam sido testados em desenvolvimento.
- Login relatado como simulado: `POST /auth/login` recebe apenas e-mail; papéis criados via seed.
- Banco relatado como SQLite em arquivo `dev.db`, sem estratégia de persistência/backup na hospedagem.
- `db:seed` não deve ser executado indiscriminadamente no deploy se recriar dados.
- SSE usa barramento em memória; múltiplas instâncias poderiam perder eventos entre processos.
- Frontend requer `API_PROXY_TARGET` para build, segundo checklist.
- Testes de backend com libsql podem terminar com código `3221225477` no Windows; investigar sem presumir falha em Linux.

## 4. Observações originais do candidato

- **1.1:** acredita que senha real não é necessária.
- **2.1:** quer avaliar quais proteções de segurança são realmente necessárias.
- **2.2:** considera controles avançados de custo dispensáveis; limite por funcionário seria um possível diferencial.
- **2.3:** observabilidade completa não é necessária.
- **2.4:** prefere CI simples de lint/typecheck/testes, sem pipeline extensa.
- **2.5:** não quer uma implementação corporativa completa de LGPD.
- **4:** deseja banco persistente sem perder usuários/chamados/artigos a cada deploy; quer evitar comprar domínio e entender impacto sobre cookies.

**Ajuste importante ao item 1.1:** o PRD pede **campo de senha na tela**, mas aceita qualquer senha nos usuários de exemplo. Não exige armazenamento/validação real de senhas. Ainda assim, a aplicação publicada deve impedir acesso indevido a chamados de outros funcionários e proteger operações exclusivas de analistas. Verificar isso no código.

## 5. Priorização preliminar (sujeita à auditoria)

### A. Alta prioridade: requisito explícito ou risco de inviabilizar demonstração

1. Verificar todos os fluxos centrais do PRD e transparência das decisões do agent.
2. Garantir que conversa e estado agent/analista sejam persistidos **e recuperáveis na interface** após recarregar/retornar, sem confundir persistência no banco com retomada de UX.
3. Garantir isolamento dos chamados por usuário e autorização das operações do analista, mesmo com login demonstrativo.
4. Preservar banco de dados após reinícios e redeploys; **não sobrescrever dados com seed**.
5. Proteger `LLM_API_KEY`, `SESSION_SECRET` e outras variáveis; revisar CORS/cookies/proxy para a hospedagem escolhida.
6. Impor limites proporcionais de uso da LLM na aplicação publicada, além do limite por conversa, para evitar abuso/custo inesperado.
7. Testar SSE e transferência/retomada no ambiente real.
8. Verificar compilação, typecheck, lint, testes e commits.
9. README fiel à implementação, com execução local, decisões, trade-offs, qualidade e deploy (se houver).

### B. Prioridade média: fazer se necessário ou se custo baixo

- Rate limit em login, chat e ações sensíveis; tamanho de payload; cabeçalhos de segurança básicos.
- `GET /health`, logs sem dados sensíveis e diagnóstico simples de erros.
- CI enxuto para frontend e backend, sem serviços complexos.
- Corrigir nota `Fonte: ...`, possíveis respostas `409` em corrida de transferência e inconsistências de chamados, conforme impacto comprovado.
- Revisar se há fila completa de conversas transferidas e chamados acessíveis ao analista, de acordo com o PRD.

### C. Geralmente fora do escopo do desafio

- SSO corporativo, recuperação de senha, onboarding real de 2.000 funcionários.
- Redis/pub-sub e autoscaling horizontal.
- Sentry/dashboards completos, alertas e métricas corporativas sofisticadas.
- Sistema de administração de artigos e contatos reais de departamentos (dados fictícios são previstos).
- Programa completo de governança/LGPD, sem deixar de respeitar privacidade e proteção básica de dados.
- Compra de domínio próprio, se subdomínios gratuitos da hospedagem funcionarem.
- Migração para PostgreSQL apenas por suposta sofisticação: comparar com Turso/libSQL remoto ou SQLite com volume persistente antes de decidir.

## 6. Decisões ainda NÃO tomadas

- Hospedagem de frontend e backend (verificar preço, plano gratuito atual, processo contínuo para SSE, hibernação, limites e configuração).
- Banco: SQLite em volume persistente, Turso/libSQL remoto ou outra alternativa; analisar migrações, custo e risco.
- Cookies de sessão e proxy entre domínios: **não trocar cookies por outra tecnologia sem demonstrar necessidade**. Subdomínio gratuito não exige comprar domínio; testar política de cookie e HTTPS.
- Política exata de rate limit e limites de custo da LLM.
- Qual subconjunto do CI e de observabilidade é justificável.
- Se existem bugs funcionais reais ou apenas itens desatualizados no checklist.

## 7. Auditoria que o Codex deve realizar (SOMENTE LEITURA)

### Regras obrigatórias

- **Não alterar código, dependências, banco, migrations, seeds, configurações ou arquivos existentes.**
- **Não executar comandos destrutivos**, `git reset`, `git clean`, migrations, seed, deploy, nem testes que escrevam no banco real. Não fazer commits ou push.
- Pode ler arquivos e executar comandos seguros de inspeção (`git status`, `git log`, `git diff`, busca no código). Antes de executar testes/build que criem artefatos ou alterem arquivos, pedir autorização.
- Não abrir nem imprimir valores de `.env` com segredos; consultar apenas nomes de variáveis e `.env.example`.
- **Não confiar cegamente no checklist de 03/11**: confirmar cada alegação no código e informar o caminho de arquivo e, quando possível, linhas.
- Separar explicitamente: **exigência do PRD**, **risco técnico real**, **boa prática opcional** e **preferência do candidato**.
- Não propor arquitetura enterprise por padrão; justificar custo, risco e tempo de cada mudança.
- Se faltar acesso ao PRD, pedir o PDF ou usar este resumo, identificando a limitação.

### Roteiro

1. **Inventário:** estrutura do monorepo, scripts, versões, dependências, backend, frontend, agent, persistência, proxy e SSE.
2. **Estado Git:** branch, arquivos modificados/não rastreados, commits recentes, migrations pendentes e possíveis arquivos de memória de agentes; **não excluir nada**.
3. **Matriz PRD x código:** cada requisito funcional e técnico; status `implementado`, `parcial`, `ausente` ou `não comprovado`, com evidência e teste recomendado.
4. **Fluxos críticos:** login demo/roles, privacidade de chamados, rascunho e confirmação, deduplicação, reabertura em 7 dias, prioridade/prazo, busca na central, transferência, pausa do agent, console, transparência, recuperação de conversa e falhas do serviço legado.
5. **Deploy:** persistência do banco em restart/redeploy, scripts de migration/seed, `API_PROXY_TARGET`, CORS, sessão/cookie, SSE e limitações de plataforma; identificar opções compatíveis com baixo custo, **sem assumir preços atuais**.
6. **Segurança/custo:** segredos, autorização, rate limit, uso indevido da LLM, logs sensíveis.
7. **Qualidade:** scripts de lint/typecheck/testes, cobertura de fluxos críticos, CI existente e lacunas de README.
8. **Plano mínimo:** ordenar correções por risco para avaliação, esforço estimado (P/M/G), dependências e quais itens descartar ou documentar como trade-off.

### Formato de saída esperado

Produzir relatório Markdown em resposta (ou propor salvar como `NEXO_ASSIST_AUDITORIA.md`, **somente após autorização para escrever**), contendo:

1. **Resumo executivo** (máximo 10 linhas).
2. **Matriz de requisitos do PRD**, com evidências de arquivo/linha.
3. **Pendências reais confirmadas** e como reproduzir/validar.
4. **Itens do checklist desatualizados, exagerados ou não necessários**.
5. **Riscos para demonstração pública**, privacidade, custo e perda de dados.
6. **Alternativas de hospedagem e persistência** com trade-offs, sem preços inventados.
7. **Plano enxuto por ordem de execução**, separando `bloqueia demonstração`, `importante`, `opcional` e `descartar`.
8. **Perguntas que exigem decisão humana**.

**Não implementar correções durante esta primeira etapa.** O candidato irá revisar o relatório antes de autorizar alterações.

## 8. Prompt pronto para colar no Codex

```text
Estou finalizando o Nexo Assist, projeto de um processo seletivo. Leia integralmente o arquivo NEXO_ASSIST_CONTEXT.md na raiz do repositório e, se disponíveis, o PRD PDF, o checklist de pré-deploy e minhas observações.

Faça uma auditoria SOMENTE LEITURA do repositório real, seguindo as regras, roteiro e formato de saída das seções 7 e 8 do contexto. NÃO altere arquivos, NÃO execute seed/migrations/deploy, NÃO faça commit/push e NÃO exponha segredos. Antes de qualquer teste/build que escreva arquivos, peça autorização.

Quero verificar o que realmente falta para cumprir o PRD e publicar uma demonstração estável, sem transformar o desafio em uma aplicação enterprise. Cite caminhos e linhas de código que sustentam cada diagnóstico, marque o que não conseguir comprovar e proponha um plano mínimo priorizado. Aguarde minha aprovação antes de implementar.
```

## 9. Como continuar depois

1. Colocar este arquivo na raiz do repositório (de preferência não commitá-lo sem decidir se ele pertence à documentação do projeto).
2. Se possível, disponibilizar também os três arquivos originais para o Codex, sobretudo o PRD.
3. Executar o prompt acima no Codex no VS Code.
4. Trazer o relatório de auditoria para uma conversa com ChatGPT; decidir as mudanças antes de pedir implementação.

---

**Nota de escopo:** este documento é um handoff de contexto, não um laudo de conformidade nem evidência de que as funcionalidades estão funcionando. O repositório é a fonte para o estado do código; o PDF do PRD é a fonte para os requisitos.
