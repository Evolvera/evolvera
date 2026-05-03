# PI Coding Agent - Context for All Agents

## Tool Usage Guidelines

### Reading Web Pages & PDFs
**Use `jina_read` for any URL content extraction:**
- Documentation pages
- PDFs
- GitHub READMEs and files
- API documentation

```bash
# When to use jina_read:
- User asks to "read this page" or "fetch content"
- Need full documentation, not just search snippets
- Reading PDF files
```

### Git Repositories
**Use `bash` with `git clone`:**
- Clone repositories for code analysis
- Fetch specific branches or commits

```bash
# Example:
git clone --depth 1 https://github.com/user/repo.git
```

### Search
**Use `minimax-web-search` for finding URLs:**
- Web searches
- Finding documentation
- Discovering resources

---

## Workflow: Research → Read → Analyze

1. **Search** → `minimax-web-search` to find relevant URLs
2. **Read** → `jina_read` to extract full content from URLs
3. **Clone** → `git clone` for code repositories
4. **Analyze** → Use read/grep/find on local content

---

## Agent Routing — Quando Usar Cada Agente

Estas regras definem qual agente usar com base na intenção do usuário na conversa natural.
NÃO pergunte "qual agente deseja usar?" — detecte automaticamente e aja.

### 🔍 Pesquisa Simples → `deep-search-master` (modo quick)

**Quando:** O usuário pede pra pesquisar algo, saber um fato, buscar informações, "me busca...", "qual é...", "cadê o...", ou qualquer pergunta factual que exija busca na web.

**Ação:** Use o agente `deep-search-master` com prompt prefixado `quick:`.

```
Exemplos de gatilho:
- "pesquisa pra mim sobre X"
- "quem é fulano?"
- "qual o endereço da empresa X?"
- "busca o CNPJ de X"
- "me acha informações sobre X"
```

**Como chamar:** `Agent(subagent_type="deep-search-master", prompt="quick: <pergunta>")`

### ✅ Verificação de Dados → `deep-search-master` (modo verify)

**Quando:** O usuário pede pra verificar, checar, confirmar, validar a veracidade de dados, informações, conhecimento ou claims que ele ou terceiros fizeram.

**Ação:** Use o agente `deep-search-master` com prompt prefixado `verify:`.

```
Exemplos de gatilho:
- "verifica se isso é verdade"
- "confirma esses dados"
- "esse CNPJ tá certo?"
- "verifica a veracidade de X"
- "checa se essa informação procede"
- "essa claim tá correta?"
```

**Como chamar:** `Agent(subagent_type="deep-search-master", prompt="verify: <dados/claims>")`

### 🏋️ Pesquisa Profunda → `deep-search-master` (modo full)

**Quando:** O usuário pede explicitamente uma **pesquisa profunda**, due diligence, análise aprofundada, ou investigação completa.

**Ação:** NÃO chame o agente direto. Siga este fluxo:

1. **Gere um plano** simples do que será pesquisado (tópico, escopo, ângulos)
2. **Apresente o plano ao usuário** e pergunte: "É isso? Quer adicionar ou alterar algo?"
3. **Aguarde confirmação** do usuário
4. **Somente após confirmação**, chame: `Agent(subagent_type="deep-search-master", prompt="deep search: <tema confirmado>")`

```
Exemplos de gatilho:
- "faz uma pesquisa profunda sobre X"
- "due diligence de X"
- "investiga a fundo X"
- "quero uma análise completa de X"
- "deep search X"
- "pesquisa profunda sobre X"
```

### 🔍 Exploração de Código → `scout`

**Quando:** O usuário pede pra mapear, explorar, entender como algo funciona no código — mas SEM planejar ou implementar. Use quando ele quer inteligência sobre o codebase antes de tomar decisões.

**Ação:** Use o agente `scout` para mapear rapidamente o codebase e retornar um relatório estruturado.

```
Exemplos de gatilho:
- "mapeia como funciona o sistema de auth"
- "explora a camada de dados"
- "encontra todos os endpoints da API"
- "mostra o fluxo de autenticação"
- "ache os testes de autenticação"

NÃO usar para:
- "implementa X" (isso é planner)
- "corrige esse bug" (faça direto)
- "refatora Y" (planner se for grande)
```

**Como chamar:** `Agent(subagent_type="scout", prompt="<missão de exploração>")`

**Modelo:** `minimax/MiniMax-M2.7-highspeed` — barato e rápido. Ideal pra explorar arquivos, grep, read, etc.

---

### 📐 Planejamento de Código → `planner`

**Quando:** O usuário pede pra planejar ou arquitetar algo mais complexo no código — features novas do zero, refactors grandes, mudanças arquiteturais, design de sistema, bug complexo depois que a raiz foi encontrada. NÃO usar para mudanças simples e cotidianas.

**Como funciona (orquestração automática):**
1. O planner roda no `kimi` (modelo caro, thinking: xhigh)
2. Na Phase 1 (Context Discovery), o planner **decompõe a tarefa** em 2-4 missões de exploração
3. Lança **scouts em paralelo** (modelo barato — `minimax/MiniMax-M2.7-highspeed`) pra mapear o codebase
4. Coleta os resultados e faz a **análise profunda** com o kimi
5. Gera o plano detalhado em `plans/YYYY-MM-DD-*.md`

**Isso economiza tokens** — a exploração custa ~10 turns de modelo barato em vez de 20-30 turns do modelo caro.

```
Exemplos de gatilho:
- "planeja a implementação de X"
- "como eu implemento X?"
- "desenha a arquitetura de X"
- "refatora o módulo X" (quando complexo)
- "cria o design do sistema X"
- "encontramos a raiz do bug, e agora?"
- "preciso mudar isso pra um sistema novo do zero"

NÃO usar para:
- "muda o texto do botão"
- "corrige esse bug simples"
- "adiciona um campo no form"
- "ajusta o CSS"
- "faz scout do código" (use scout direto)
```

**Como chamar:** `Agent(subagent_type="planner", prompt="<descrição do que precisa ser planejado>")`

### 📋 Planejamento Rápido → `planner-quick`

**Quando:** O usuário pede pra planejar algo **simples ou direto** — quick fixes, ajustes de 1-5 arquivos, trocas de string, correção de tool names, configurações, ou quando a root cause já é conhecida. Use quando o problema é claro e a solução é óbvia.

**Diferença do `planner`:**
- **planner**: arquitetura complexa, features do zero, refactors grandes, multi-módulo
- **planner-quick**: quick fixes, trocas simples, ajustes de config, correções diretas

**Como funciona:**
- Roda com `thinking: minimal` e `max_turns: 8`
- NÃO usa scouts (economiza tokens)
- NÃO cria ADRs, scenario matrix, ou 12 appendices
- Gera plano de 50-200 linhas no máximo
- Se a solução for óbvia em 2-3 turns, para e responde direto

```
Exemplos de gatilho:
- "corrige os tool names"
- "troca minimax_web_search por web_search"
- "ajusta o prompt do agente X"
- "faz um plano simples pra Y"
- "como eu corrijo isso?" (quando a root cause já é conhecida)
- "ajusta o CSS"
- "adiciona um campo no form"

NÃO usar para:
- "planeja a arquitetura de X" (use planner)
- "refatora o módulo Y" (use planner se for grande)
- "design do sistema Z" (use planner)
```

**Como chamar:** `Agent(subagent_type="planner-quick", prompt="<descrição simples do problema e solução esperada>")`

### 🔨 Execução de Código → `builder`

**Quando:** O usuário pede pra implementar, executar, ou buildar algo que já tem um plano (do `planner` ou inline). É o braço operacional — recebe um plano e executa com disciplina Git-first, dual-checklist (TILL-DO → TODO), e verificação final rigorosa. Use para tarefas de complexidade média/alta que não são triviais (não é pra mudar texto de botão, mas sim pra implementar features, fazer refactors dirigidos, bug fixes não-triviais, etc.).

**Pipeline natural**: `planner` gera plano → `builder` executa o plano. Mas também pode ser invocado direto pelo usuário para executar mudanças a partir de um plano informal.

**Como funciona:**
1. **Git Step 0** — cria branch isolada `agent/<timestamp>-<desc>`, anota base commit
2. **TILL-DO.md** — sanity gates que BLOQUEIAM execução até 100% ✅
3. **TODO.md** — steps atômicos, one-change-one-verification
4. **Execução** — edit precision, import hygiene, test-first
5. **Final Verification** — syntax, types, imports, tests, edge cases, secrets, git diff
6. **Cleanup** — apaga checklists, branch pronta para review

### ⚠️ IMPORTANTE: Builder roda em branch/worktree isolado

O builder **sempre** executa suas mudanças numa branch separada, NÃO no diretório de trabalho principal. Isso é proposital — protege o código de mudanças quebradas.

**O que isso significa pra você (agente principal):**
- Quando o builder terminar, as mudanças estão numa **branch separada**, não nos arquivos do diretório atual
- **NUNCA** assuma que os arquivos foram modificados no diretório de trabalho
- **SEMPRE** após o builder completar:
  1. Pegue o resultado com `get_subagent_result({ agent_id: "...", verbose: true })`
  2. Identifique qual **branch** o builder criou
  3. Faça `git merge <branch-do-builder>` pra trazer as mudanças pro diretório de trabalho
  4. Só DEPOIS do merge faça build/test/commit/push

**Fluxo correto:**
```
builder completa → get_subagent_result(verbose: true)
  → identificar branch criada pelo builder
  → git checkout main && git merge <builder-branch>
  → build/test/commit/push
```

**Fluxo ERRADO (não fazer):**
```
builder completa → assumir que arquivos foram modificados
  → tentar commit/build direto → SURPRESA: nada mudou
```

```
Exemplos de gatilho:
- "implementa o plano de X" (plano já existe)
- "executa esse plano do planner"
- "builda a feature X seguindo esse plano"
- "implementa X" (tarefa média/complexa, sem trivialidade)
- "faz o refactor de Y seguindo o plano"

NÃO usar para:
- "muda o texto do botão" (trivial, faça direto)
- "ajusta o CSS" (trivial)
- "explora o código" (use scout)
- "planeja X" (use planner)
- "pesquisa X" (use deep-search-master)
```

**Como chamar:** `Agent(subagent_type="builder", prompt="<plano ou descrição da tarefa>\n\nPlano:\n<conteúdo do plano>")`

---

## Pipeline Completa de Código

A pipeline natural para mudanças de código não-triviais:

```
scout → mapeia codebase (inteligência)
  ↓
planner → gera plano detalhado (plans/*.md)
  ↓
builder → executa plano (branch isolada, TILL-DO → TODO → Final Verification)
  ↓
validator → quality gate final (testes, segurança, observabilidade, arquitetura)
```

**Quando pular etapas:**
- Tarefa trivial (mudar texto, CSS, prop simples) → faça direto, sem agentes
- Tarefa média com plano informal → `builder` direto (sem planner)
- Mudança pequena mas que toca área crítica (auth, payment, PII) → `builder` + `validator`
- Mudança de alto impacto ou muito extensa → pipeline completa `planner` → `builder` → `validator`

**Validator automático após builder:** Se o builder executou mudanças de alto impacto (security, data flow, external APIs, critical paths), ou mudanças muito extensas (>10 files), invoque o `validator` automaticamente após o builder completar. Não pergunte — faça.

---

### 🚨 Problema com o PI → `pi-steward`

**Quando:** O PI errou, fez operação destrutiva, alucinou, MCP caiu, feature faltante, ou o usuário reclama da ferramenta. É o canal de feedback automático para melhorar o PI.

**Ação:** Use o agente `pi-steward` para coletar contexto, formatar issue, pedir confirmação do usuário, e criar no GitHub.

```
Exemplos de gatilho (manual — usuário reclama):
- "o PI errou"
- "abre issue"
- "reporta isso"
- "isso tá errado"
- "o PI fez besteira"
- "registra esse problema"

Exemplos de gatilho (automático — PI detecta):
- PI chamou tool inexistente
- PI apagou arquivo importante
- PI alucinou API ou path
- MCP server não conectou
- Routing falhou (AGENTS.md não disparou)

NÃO usar para:
- Erro do usuário (prompt errado, expectativa errada)
- Falha de serviço externo (API down) — a menos que PI lidou mal com isso
- Problemas já documentados como known issues
```

**Como chamar:** `Agent(subagent_type="pi-steward", prompt="<descrição do problema e contexto>")`

---

### 🤖 Criação de Agente → `agent-expert`

**Quando:** O usuário pede pra criar, configurar, ou modificar um agente do PI.

**Ação:** NÃO chame o agente direto. Siga este fluxo:

1. **Gere um plano simples** do agente proposto (nome, propósito, tools, comportamento)
2. **Apresente ao usuário** e pergunte: "É isso? Quer ajustar algo?"
3. **Aguarde confirmação** do usuário
4. **Somente após confirmação**, chame: `Agent(subagent_type="agent-expert", prompt="<detalhes do agente confirmado>")`

```
Exemplos de gatilho:
- "cria um agente que faz X"
- "quero um agente pra Y"
- "configura um agente de Z"
- "modifica o agente X"
```

---

### 🛡️ Validação de Código → `validator`

**Quando:** O usuário pede pra validar, auditar, ou revisar qualidade de código antes de merge. Use quando ele quer um quality gate completo — testes, observabilidade, segurança, arquitetura. O validator pode gerar testes faltantes e BLOQUEIA código ruim independentemente da fonte.

**Ação:** Use o agente `validator` com o escopo da validação (branch, PR, diff, arquivos específicos).

```
Exemplos de gatilho:
- "valida esse PR"
- "roda o validator na branch X"
- "faz code review desse diff"
- "audita os testes dessa feature"
- "valida a qualidade desse código"
- "verifica cobertura de testes"
- "auditoria de segurança no código"

NÃO usar para:
- "muda o texto do botão" (trivial)
- "explora o código" (use scout)
- "implementa X" (use builder)
- "pesquisa X" (use deep-search-master)
```

**Como chamar:** `Agent(subagent_type="validator", prompt="<escopo da validação: branch, PR, diff, arquivos>")`

**Modelo:** `minimax/MiniMax-M2.7-highspeed` — rápido e barato. Ferramentas: read-only + write para testes + VSCode diagnostics.

---

### 🎨 Construção de Website → Chain: `website-designer` → `builder` → `validator` → `website-polisher` → `builder` → `validator`

**Quando:** O usuário quer criar, construir, ou desenvolver um website, landing page, site institucional, blog, e-commerce, ou qualquer presença web. Também quando o usuário preenche o briefing via `/website-brief`.

**Ação:** Orquestrar a chain completa de 6 passos (4 agentes, 2 usados 2x):
1. `website-designer` — Analisa briefing e gera DESIGN_PLAN.md
2. `builder` — Implementa o plano em branch isolada (Git-first)
3. `validator` — Quality gate pós-build (compilação, tipos, estrutura)
4. `website-polisher` — Audit UI/UX e gera POLISH_PLAN.md (READ-ONLY, não edita código)
5. `builder` — Aplica correções do POLISH_PLAN.md na mesma branch
6. `validator` — Quality gate final (testes, acessibilidade, segurança)

```
Exemplos de gatilho:
- "cria um site para minha clínica"
- "builda uma landing page para meu SaaS"
- "faz um site institucional com blog"
- "preciso de um e-commerce"
- "quero um site de portfólio"
- "/website-brief MeuProjeto"
- "builda um website"
- "cria uma landing page"
```

**NÃO usar para:**
- Ajustes simples em site existente (use `builder` direto)
- Apenas design sem implementação (use `website-designer` isolado)
- Apenas review de site existente (use `website-polisher` ou `validator` isolados)
- Hospedagem/deploy (fora do escopo dos agentes)

**Como funciona a chain:**
```
website-designer (gera DESIGN_PLAN.md)
    ↓
builder [pré-existente] (implementa em branch agent/<timestamp>-website)
    ↓
validator [pré-existente] (quality gate pós-build → REVIEW.md)
    ↓
website-polisher (gera POLISH_PLAN.md — READ-ONLY)
    ↓
builder [pré-existente] (aplica correções visuais)
    ↓
validator [pré-existente] (quality gate final → REVIEW.md final)
```

**Nota:** O agente designer NÃO escreve código. Ele escreve apenas DESIGN_PLAN.md. O builder lê este arquivo e executa. O polisher NÃO edita código — apenas lê e gera POLISH_PLAN.md com instruções detalhadas (file, old_string, new_string) para o builder executar.

---

## Resumo Rápido de Roteamento

| Intenção do Usuário | Agente | Prefixo | Pede Confirmação? |
|---------------------|--------|---------|-------------------|
| Pesquisar algo simples | `deep-search-master` | `quick:` | ❌ Não, vai direto |
| Verificar dados/claims | `deep-search-master` | `verify:` | ❌ Não, vai direto |
| Pesquisa profunda | `deep-search-master` | `deep search:` | ✅ Sim, planeja primeiro |
| Explorar/mapear código | `scout` | — | ❌ Não, vai direto |
| Executar implementação | `builder` | — | ❌ Não, vai direto |
| Planejar código complexo | `planner` | — | ❌ Não, vai direto |
| Planejar quick fix/simples | `planner-quick` | — | ❌ Não, vai direto |
| Executar implementação | `builder` | — | ❌ Não, vai direto |
| Validação/auditoria de código | `validator` | — | ❌ Não, vai direto |
| PI errou / problema na ferramenta | `pi-steward` | — | ❌ Não, mas pede confirmação antes de criar issue |
| Criar/modificar agente | `agent-expert` | — | ✅ Sim, planeja primeiro |
| Construção de Website | `website-designer` → `builder` → `validator` → `website-polisher` → `builder` → `validator` | — | ❌ Não, vai direto |

---

## Available Tools

| Tool | Purpose | Example |
|------|---------|---------|
| `minimax-web-search` | Search web | `minimax_web_search({ query: "..." })` |
| `jina_read` | Read URL content | `jina_read({ url: "..." })` |
| `bash` | Execute commands | Git operations |
| `read` | Read local files | Code analysis |
