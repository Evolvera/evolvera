---
name: flow
description: Transform a giant implementation backlog into GitHub issues with priority/effort, then ship one-by-one through a real kanban (backlog→ready→in progress→in review→done) with one branch per issue and live board updates. Always scouts the existing repo by module first, teaches how to read the board like an engineer, educates when inputs are missing, proposes a plan, and only acts after explicit user OK. Use for backlog→issues, "continue project X", next-issue loops, or a generic GitHub permission unblock checklist.
---

# Flow — Backlog → Issues → Ship

Skill operacional para transformar uma lista grande de implementação em issues do repositório, priorizar/estimar, e entregar uma por uma até PR.

**Regra de ouro:** o Flow quase sempre roda em **projeto existente** (não greenfield). Antes de perguntar ou criar issues, **entenda o repo com scouts por módulo**. Depois proponha, tire dúvidas, e só avance com **OK explícito** do usuário.

```txt
Entrada (lista / “segue o projeto X” / “próxima issue” / “só /skill:flow”)
  → Educar se faltar contexto (não inventar backlog)
  → Permission gate GitHub
  → Ler o kanban atual (issues + labels + PRs)  
  → Scout do projeto por módulos (evidence-first)
  → Draft de backlog + sugestões + dúvidas abertas
  → REVIEW GATE: usuário aprova (OK)
  → Criar/atualizar issues (priority + effort + status)
  → Loop engenheiro:
       ler board → puxar 1 issue ready
       → branch NOVA off default (1 issue = 1 branch)
       → status: in progress (atualizar kanban NA HORA)
       → planner/builder → commits na branch da issue
       → PR → status: in review
       → merge verificado → issue fechada + status: done
       → PR fechado sem merge: blocked/anomaly, nunca done
       → voltar ao board (nunca reutilizar a branch pra outra issue)
```

## Quando usar

- Usuário entrega uma lista grande do que já é pra implementar
- Quer issues reais no GitHub ligadas ao repo
- Quer prioridade + effort estimados a partir do estado atual do sistema
- Quer loop de entrega issue-a-issue até PR
- Diz **“segue o projeto X”**, **“continua o board”**, **“próxima issue”**, **“o que tem ready?”**
- Faltam permissões e precisa de checklist genérico pro usuário repassar a quem administra o repo/org
- Usuário chama `/skill:flow` com pouco ou nenhum input — **ainda assim a skill deve educar e guiar**

---

## Princípios de interação (obrigatórios)

1. **Evidence before questions** — scoute o repo antes de bombardear o usuário. Perguntas devem ser informadas pelo que o código mostra.
2. **Never invent backlog** — sem lista/pedido claro **e** sem board existente, **não fabrique** issues. Eduque e peça o mínimo.
3. **Propose, then ask** — sempre mostre um draft (o que faria) + sugestões + dúvidas. Não execute criação em massa no escuro.
4. **Explicit OK gates** — em todo ponto irreversível (criar issues, puxar issue, abrir PR se combinado, mudar labels em lote), peça confirmação. “OK”, “pode”, “aprovo”, “manda”, “continua”, “próxima” = go pro passo pedido. Silêncio ≠ aprovação.
5. **Educate, don’t scold** — se o usuário veio sem nada, explique o que o Flow precisa e como fornecer, em tom colaborativo.
6. **One concern per gate** — não misture “aprova as 20 issues” com “escolhe stack” na mesma pergunta confusa; separe decisões.
7. **Read the board first** — em continue/próxima, leia issues+labels+PRs+branches antes de codar.
8. **1 issue = 1 branch off default** — atualize o kanban **na hora** de cada transição (ready → in progress → in review → done). Nunca reutilize branch de outra issue.
9. **WIP = 1** por executor (default) — termine ou estacione com transparência antes de puxar outro card.
10. **GitHub é autoridade, local é cache** — precedência: **GitHub Project Status (quando configurado) → estado das issues/PRs + branches remotas atuais → `.pi/flow/` → `.pi/memory/`/chat**. Uma leitura remota nova sempre substitui estado local antigo; nunca trate cache local como claim ou lock.
11. **Regressão cumulativa é obrigatória** — toda issue preserva e executa a suíte relevante já existente; novos testes de regressão/contrato entram na mesma entrega sempre que a mudança corrigir ou proteger comportamento. Uma issue posterior só avança se provar que não quebrou os fluxos anteriores afetados. Falha, lacuna material de cobertura ou teste não executável mantém a issue bloqueada/em review, nunca done.
12. **Caracterizar antes de alterar** — quando uma feature existente e funcional não tem cobertura suficiente, criar primeiro uma baseline de caracterização: catálogo de jornadas válidas, contratos, status/respostas e efeitos persistidos, com fixtures sintéticas e ambiente isolado. Mudanças funcionais na mesma superfície dependem dessa baseline passar na default branch. A baseline preserva comportamento legítimo, não vulnerabilidades, bypasses ou bugs conhecidos.

---

## Cold start — usuário chamou Flow sem nada / faltando coisa

Se a mensagem for só `/skill:flow`, “roda o flow”, ou vier incompleta, **não saia criando issues**.

### 1) Detectar o que falta

| Peça | Como detectar |
|------|----------------|
| Repo git local | `git rev-parse --show-toplevel` |
| Remote GitHub | `gh repo view` / `git remote -v` |
| Lista de implementação | body do user, arquivo citado, issue board existente |
| Permissão write | `viewerPermission` + teste de list/create |
| Working tree limpa o suficiente | `git status --short` |

### 2) Educar com template curto

```md
## Flow — o que eu preciso pra rodar bem

Estou no repo: `OWNER/REPO` (ou: **não achei repo git aqui**).

### Já tenho
- ...

### Falta
- [ ] Lista do que é **pra implementar agora** (não ideias soltas)
- [ ] ...

### Como me passar a lista (qualquer formato)
1. Cola no chat (bullets / numerada)
2. Aponta um arquivo (`TODO.md`, plan, notes)
3. Diz “usa as issues abertas do repo e reorganiza”
4. Diz o outcome (“quero X funcionando”) e eu derivo um draft **depois** de scouter o código

### O que eu vou fazer depois que tiver o mínimo
1. Mapear o projeto por módulos (scouts)
2. Normalizar backlog + priority/effort sugeridos
3. Te mostrar o plano e as dúvidas
4. Só criar issues / puxar trabalho depois do teu **OK**

Me manda a lista (ou o outcome) e confirma se o repo acima é o certo.
```

### 3) Se não estiver em um repo

Pare. Peça:

- `cd` para o projeto, **ou**
- path do repo local, **ou**
- `owner/name` + clone se fizer sentido

Flow **assume projeto no disco** para scouts. Não invente estrutura de app.

### 4) Se tiver outcome mas sem lista

OK parcial: rode scouts → proponha backlog draft a partir do código + outcome → **ainda assim** peça OK antes de criar issues.

---

## Phase 0 — Repo + Permission Gate

```bash
git rev-parse --show-toplevel
git status --short
git branch --show-current
git remote -v

gh repo view --json nameWithOwner,url,defaultBranchRef,viewerPermission -q .
gh auth status
gh api user -q .login
gh issue list --limit 5
gh label list --limit 50
```

### Permissões mínimas

| Ação | Precisa |
|------|---------|
| Listar issues | `repo` (ou public read) |
| Criar issues | write no repo |
| Criar labels | write no repo (admin/maintain ideal) |
| Abrir PR | write + push de branch |
| Mover project status | acesso ao Project (se usado) |

### Se faltar permissão

**NÃO invente workarounds silenciosos.** Entregue checklist **genérico para o usuário** (sem nomes de pessoa). O usuário repassa a quem administra o repo/org.

```md
# Unblock checklist — Flow (repo: OWNER/REPO)

## Conta GitHub do executor
- [ ] Login: `ACCOUNT_LOGIN`
- [ ] Token scopes atuais: ...
- [ ] Scopes necessários: `repo`, `project` (se board), `workflow` (se CI/PR checks)

## Acesso no repositório
- [ ] Adicionar `ACCOUNT_LOGIN` como Collaborator com role **Write** (mínimo) ou **Maintain**
- [ ] Se org: aprovar pending invite / SSO authorize
- [ ] Confirmar branch protection: executor pode abrir PR e receber review

## Labels / Project (opcional mas recomendado)
- [ ] Permitir criar labels: priority:*, effort:*, status:*
- [ ] Se usar GitHub Projects: adicionar `ACCOUNT_LOGIN` ao project com write

## Validação depois de liberar
```bash
gh auth status
gh repo view --json viewerPermission
gh issue list --limit 1
gh label list
```
```

Espere o usuário confirmar que liberou. Só então continue.

Salve em `.pi/flow/<repo-slug>/PERMISSIONS.md` se o gate falhar.

---

## Phase 1 — Entender o projeto (scouts por módulo) **ANTES** de perguntar

> Projetos reais não são greenfield. **Proibido** montar backlog sério ou questionário gordo sem mapear o código.

### 1.1 Shape rápido (orquestrador, sem agent se for barato)

```bash
ls -la
find . -maxdepth 2 -type f -name 'package.json' -o -name 'pyproject.toml' -o -name 'go.mod' -o -name 'Cargo.toml' -o -name 'README*' 2>/dev/null
```

Identifique stack, entrypoints, pastas top-level.

### 1.2 Scouts por módulo (obrigatório se >3 arquivos de entendimento)

Carregue `agent-guide` + `scout`. Prefira **vários scouts paralelos e estreitos** por módulo/ângulo:

| Scout | Pergunta típica |
|-------|-----------------|
| shape | estrutura top-level, stack, scripts, deploy |
| domain A | como funciona o módulo X (paths, entry, deps) |
| domain B | módulo Y… |
| data/auth | models, DB, auth, tenancy se existirem |
| tests/ci | como validar, pipelines, quality gates |
| existing issues | issues/PRs abertos que se sobrepõem ao backlog |

Cada scout deve devolver: paths exatos, linhas, riscos, “o que NÃO está claro”. O scout de testes/CI também deve inventariar a cobertura realmente executável por jornada (unit, integração, contrato, E2E/smoke e manual), apontar features funcionais sem proteção e recomendar a baseline mínima antes de mudanças naquela superfície.

### 1.3 Síntese local

Escreva (não commitar a menos que peçam):

`.pi/flow/<repo-slug>/PROJECT_MAP.md`

```md
# Project map — OWNER/REPO

## Stack & shape
- ...

## Modules
| Module | Path | Responsibility | Risk notes |
|--------|------|----------------|------------|
| ... | ... | ... | ... |

## Existing delivery signals
- Open issues relevant: ...
- Labels already used: ...
- Branch protection / default branch: ...

## Implications for backlog
- ...
```

### 1.4 Só agora pergunte

Perguntas **depois** do map devem:

- citar o que o código mostrou (“vi que auth está em `src/auth` e não há testes de session…”)
- oferecer defaults/sugestões
- marcar o que bloqueia criação de issues vs o que pode assumir com label

**Não pergunte o óbvio** que o repo já responde (stack, default branch, se tem monorepo, etc.) a menos que haja conflito.

---

## Phase 2 — Normalizar backlog + draft de plano

Transforme a lista bruta (ou o draft derivado do outcome) em itens canônicos.

Para cada item:

1. **Título curto** (≤ ~80 chars, verbo + objeto)
2. **Descrição** (o quê / por quê / contexto)
3. **Acceptance criteria** (bullets testáveis)
4. **Área do sistema** (módulos/paths do PROJECT_MAP)
5. **Dependências**
6. **Impacto de regressão** — jornadas, contratos, integrações e dados já existentes que a issue pode afetar; identificar a suíte/comandos que devem ser executados.
7. **Tipo**: `feature` | `fix` | `chore` | `refactor` | `docs` | `infra`

Para toda issue de código, os acceptance criteria devem incluir, quando aplicável:

- teste novo ou ajustado que reproduz o bug/contrato/mudança;
- suíte de regressão direcionada aos módulos e jornadas afetados;
- suíte padrão do repositório (ou uma justificativa explícita e aprovada para a parte que não puder rodar);
- regressões de issues anteriores que compartilhem superfície, executadas antes de PR e registradas como evidência.

Se a cobertura de uma feature funcional existente for ausente ou insuficiente, o backlog deve conter uma issue de **baseline de caracterização** antes das mudanças que possam afetá-la. Essa issue deve: catalogar comportamento válido versus bugs/vulnerabilidades conhecidos; automatizar primeiro as jornadas Tier 0 (auth, dinheiro, dados críticos) e depois as jornadas core; usar banco/fixtures e providers fake; e provar que a baseline passa na branch default. As issues posteriores devem depender dela.

### Dedup e corte

- Mesclar duplicatas (entre si e com issues GitHub já abertas)
- Quebrar epics em 2–5 issues shippable
- Marcar `blocked` se depender de decisão externa
- Não criar issue para “pesquisar depois” sem outcome

`.pi/flow/<repo-slug>/BACKLOG.md`

```md
# Flow Backlog — OWNER/REPO — YYYY-MM-DD

## Implement now
| # | Title | Type | Area | Deps | Priority* | Effort* | Notes |
|---|-------|------|------|------|-----------|---------|-------|
| 1 | ... | feature | src/... | — | P1 | M | ... |

## Later / out of scope
- ...

## Ambiguous (need user before create)
- ...

\* suggested — pending OK
```

---

## Phase 3 — Estimar priority + effort (baseado no sistema)

Não chute no vácuo. Use PROJECT_MAP + evidência:

1. Módulos tocados e shared surfaces
2. Complexidade (arquivos, tests, migrations)
3. Risco (auth, payments, data, multi-tenant, deploy)
4. Dependências entre items
5. L/XL se multi-módulo ou arquitetura incerta; S se local/mecânico

### Priority (P0–P3)

| Label | Significado | Quando |
|-------|-------------|--------|
| `priority:p0` | Bloqueia valor / correção crítica | bug severo, unblocker, release gate |
| `priority:p1` | Alto valor, próximo | core path do produto |
| `priority:p2` | Importante, não urgente | melhoria com dependência baixa |
| `priority:p3` | Nice-to-have / polish | cosmético, debt leve |

### Effort (S/M/L/XL)

| Label | Ordem de grandeza | Sinal |
|-------|-------------------|-------|
| `effort:s` | horas / 1 arquivo | change local, baixo risco |
| `effort:m` | 0.5–1 dia / poucos arquivos | feature pequena com testes |
| `effort:l` | multi-day / multi-módulo | planner recomendado |
| `effort:xl` | epic | **quebrar** antes de implementar |

---

## Phase 4 — REVIEW GATE (sempre, antes de criar issues)

Mostre um pacote único e legível. **Espere OK.**

```md
## Flow proposal — OWNER/REPO

### Entendi o projeto assim
- Stack: ...
- Módulos relevantes: ...
- Sinais existentes (issues/labels): ...

### Vou criar N issues (implement now)
| # | Title | P | E | Area | Why this order |
|---|-------|---|---|------|----------------|
| 1 | ... | P0 | S | ... | ... |

### Sugestões (baseadas no map)
- Quebrar X em A/B porque ...
- Reusar issue #K em vez de duplicar ...
- Ordem recomendada de pull: #… → #…
- Labels: criar padrão Flow **ou** reusar as do repo (`…`)

### Fora de escopo / later
- ...

### Dúvidas que precisam do teu OK (tudo que não está 100%)
1. ...
2. ...

### Assumptions se você só disser “OK” sem detalhar
- ...

### Próximo passo se aprovar
- Criar labels (se necessário) + issues com `status:backlog`
- **Não** puxar implementação até um segundo OK

Responde com **OK** (e ajustes se quiser), ou corrige a lista.
```

### Regras do gate

- Sem OK → **zero** `gh issue create`
- Se o user ajustar 2 itens → atualize draft e **reconfirme** se a mudança for material
- Se disser “OK cria e já puxa a primeira” → isso cobre create + start da #1; ainda confirme acceptance da #1 se estiver vaga
- Eduque se o user pedir “só cria tudo agora” com lista ambígua: mostre o risco e peça o mínimo de clareza nos itens P0/P1

---

## Phase 5 — Labels + criar issues (só pós-OK)

### Labels (idempotente; reutilize convenção do repo se já existir)

```bash
gh label create "priority:p0" --color "B60205" --description "Critical / blocker" 2>/dev/null || true
gh label create "priority:p1" --color "D93F0B" --description "High priority" 2>/dev/null || true
gh label create "priority:p2" --color "FBCA04" --description "Medium priority" 2>/dev/null || true
gh label create "priority:p3" --color "0E8A16" --description "Low priority" 2>/dev/null || true

gh label create "effort:s" --color "C5DEF5" --description "Small" 2>/dev/null || true
gh label create "effort:m" --color "1D76DB" --description "Medium" 2>/dev/null || true
gh label create "effort:l" --color "5319E7" --description "Large" 2>/dev/null || true
gh label create "effort:xl" --color "3E4B9E" --description "Extra large / split" 2>/dev/null || true

gh label create "type:feature" --color "A2EEEF" --description "Feature" 2>/dev/null || true
gh label create "type:fix" --color "D73A4A" --description "Bug fix" 2>/dev/null || true
gh label create "type:chore" --color "FEF2C0" --description "Chore" 2>/dev/null || true
gh label create "type:refactor" --color "D4C5F9" --description "Refactor" 2>/dev/null || true
gh label create "type:docs" --color "0075CA" --description "Docs" 2>/dev/null || true
gh label create "type:infra" --color "BFDADC" --description "Infra" 2>/dev/null || true

gh label create "status:backlog" --color "EDEDED" --description "Flow: backlog" 2>/dev/null || true
gh label create "status:ready" --color "BFD4F2" --description "Flow: ready" 2>/dev/null || true
gh label create "status:in-progress" --color "FBCA04" --description "Flow: in progress" 2>/dev/null || true
gh label create "status:in-review" --color "D93F0B" --description "Flow: in review" 2>/dev/null || true
gh label create "status:done" --color "0E8A16" --description "Flow: done" 2>/dev/null || true
```

Se o repo já tiver labels equivalentes, **mapeie** e não duplique semântica.

### Criar issue

```bash
gh issue create \
  --title "<title>" \
  --label "priority:p1,effort:m,type:feature,status:backlog" \
  --body "$(cat <<'EOF'
## Summary
<1-3 frases>

## Context
- Área: `path/...`
- Origem: flow backlog
- Project map: módulos ...

## Acceptance criteria
- [ ] ...
- [ ] ...

## Implementation notes
- ...

## Dependencies
- Blocks: #
- Blocked by: #

## Flow metadata
- Priority: P1
- Effort: M
- Suggested path: planner (L/XL) | direct builder (S/M simples)
EOF
)"
```

### Regras

- Reportar cada URL/número
- Não recriar se já existir equivalente — linkar
- `effort:xl` → split antes de `ready`
- Mapa local:

`.pi/flow/<repo-slug>/ISSUES.md`

```md
# Flow Issues — OWNER/REPO

| Backlog # | Issue | Priority | Effort | Status | Assignee | Branch | PR | Last verified at |
|-----------|-------|----------|--------|--------|----------|--------|----|------------------|
| 1 | [#12](https://...) | P1 | M | backlog | — | — | — | 2026-07-09T12:00:00Z |
```

`ISSUES.md` é uma projeção local do remoto, não um board alternativo. Atualize a linha após cada transição verificada e use timestamp UTC ISO-8601.

Depois de criar, reporte distribuição e **pergunte**:

> Só issues por enquanto, ou puxo a primeira (`#N`) pro planner?

Espere OK de novo se for implementar.

---

## Phase 6 — Re-entry + ler o kanban como engenheiro (obrigatório)

Antes de puxar qualquer issue — inclusive em chat novo ou quando o user disser **"segue"**, **"continua"**, **"próxima"** — reconstrua a entrega pelo GitHub. A ordem de autoridade é:

1. **GitHub Project Status**, quando um Project estiver configurado para o repo;
2. **issue/PR no GitHub + branches no remote atual**;
3. cache local `.pi/flow/<repo-slug>/`;
4. `.pi/memory/` e contexto do chat.

Conflito é resolvido pela fonte mais alta. Uma leitura remota nova sempre invalida fatos locais antigos. `.pi/flow` é rebuildable e nunca é lock, claim ou motivo para recriar backlog ausente.

### 6.0 Re-entry remoto obrigatório

Execute nesta ordem em **todo** continue/próxima e no início de um chat novo:

```bash
REPO_NWO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
OWNER=${REPO_NWO%/*}
REPO=${REPO_NWO#*/}
DEFAULT=$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name)
EXECUTOR=$(gh api user -q .login)
git fetch --prune origin

# Descubra Projects v2 ligados ao repo sem depender de chat/cache anterior.
gh api graphql --paginate \
  -F owner="$OWNER" -F repo="$REPO" \
  -f query='query($owner:String!,$repo:String!,$endCursor:String){
    repository(owner:$owner,name:$repo){
      projectsV2(first:100,after:$endCursor){
        nodes{id number title url closed owner{... on Organization{login} ... on User{login}}}
        pageInfo{hasNextPage endCursor}
      }
    }
  }'

# Enumere issues e PRs até o fim; limites fixos não provam ausência/estado global.
gh api --paginate "repos/$OWNER/$REPO/issues?state=all&per_page=100" \
  --jq '.[] | select(has("pull_request") | not) | {number,title,state,labels:[.labels[].name],assignees:[.assignees[].login],updated_at,closed_at,html_url}'

gh api --paginate "repos/$OWNER/$REPO/pulls?state=all&per_page=100" \
  --jq '.[] | {number,title,state,draft,head:.head.ref,base:.base.ref,merged_at,closed_at,html_url}'

# Inventarie todas as branches do remote; depois classifique Flow, legacy e anomalias.
# Filtrar só `flow/#*` pode esconder WIP antigo/não conforme.
git ls-remote --heads origin

git status --short
git branch --show-current
git rev-parse HEAD
```

Project discovery:

1. Ignore Projects `closed=true` unless the user explicitly says they remain authoritative.
2. If exactly one open Project is linked, use its returned `owner.login` and `number`.
3. If multiple open Projects are linked, compare their title/URL and documented repo convention; if authority is still ambiguous, stop and ask which Project owns delivery status.
4. If none is linked, use labels `status:*`. If a linked Project exists but permission prevents reading it, report the permission blocker rather than silently falling back to labels.
5. For the selected Project, resolve all items and the `Status` field before classifying the board:

```bash
PROJECT_OWNER=<owner.login>
PROJECT_NUMBER=<number>
PROJECT_ID=<id retornado na discovery>

flow_project_items() {
  local total limit
  total=$(gh project item-list "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --limit 1 --format json --jq '.totalCount')
  limit=$total
  [ "$limit" -gt 0 ] || limit=1
  # O mesmo response usado na classificação valida seu próprio `totalCount`.
  gh project item-list "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --limit "$limit" --format json \
    --jq 'if (.items | length) == .totalCount then . else error("Project item list truncated") end'
}

flow_project_fields() {
  local total limit
  total=$(gh project field-list "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --limit 1 --format json --jq '.totalCount')
  limit=$total
  [ "$limit" -gt 0 ] || limit=1
  # O mesmo response usado para resolver Status/options valida seu próprio `totalCount`.
  gh project field-list "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --limit "$limit" --format json \
    --jq 'if (.fields | length) == .totalCount then . else error("Project field list truncated") end'
}

flow_project_items
flow_project_fields
# Guarde o field id de `Status` e os option ids de Backlog/Ready/In progress/In review/Done.
```

Confirme as duas igualdades antes de usar Project como autoridade; truncamento de items ou fields bloqueia classificação global. Para uma issue/PR candidata, complemente com `gh issue view <N> --json number,title,state,labels,assignees,closedAt,url`, `gh pr view <PR> --json number,url,state,isDraft,headRefName,baseRefName,headRefOid,mergedAt,closedAt,reviewDecision,statusCheckRollup` e, quando necessário, `gh pr checks <PR>`.

**Só depois** leia `STATE.md`, `ISSUES.md` e `PROJECT_MAP.md`. Se `.pi/flow` estiver ausente, reconstrua-o do remoto; não recrie backlog/issues. Registre o instante real da leitura remota em UTC, não o horário lembrado pelo chat.

### 6.1 Cache canônico de re-entry

`.pi/flow/<repo-slug>/STATE.md`:

```md
# Flow State — OWNER/REPO

- Authority: GitHub (Project Status when configured, then issue/PR/remote branches)
- Repo: OWNER/REPO
- Remote: origin — https://github.com/OWNER/REPO.git
- Default branch: main
- Active issue: #123 | none
- Executor login: octocat
- Assignee/claim: octocat | unclaimed | ambiguous: login-a,login-b
- Branch: flow/#123-short-slug | none
- PR: #456 — https://github.com/OWNER/REPO/pull/456 — OPEN | CLOSED | MERGED | none
- Stage: backlog | ready | claiming | in-progress | in-review | blocked | done | anomaly | idle
- Remote head SHA: <40-char SHA> | none
- Last verified at: 2026-07-09T12:00:00Z
```

Escreva apenas fatos verificados. `STATE.md` pode ser apagado e reconstruído sem perda remota; nunca use sua presença como exclusão mútua.

### 6.2 Classificar o board reconciliado

| Coluna | Postcondição remota | Significa |
|--------|---------------------|-----------|
| **backlog** | Project/label backlog | Capturado, ainda **não** está pronto pra puxar |
| **ready** | Project/label ready; sem claim conflitante | Definition of Ready ok |
| **in progress** | assignee executor + branch remota única `flow/#N-*` + Project/label coerente | Claim visível e implementação ativa |
| **in review** | PR aberto com head da issue/base default + Project/label coerente | Esperando review/checks |
| **done** | PR correspondente com `mergedAt != null`, issue fechada e status coerente | Entregue |

Issue fechada ou PR fechado sem merge **não** implica done.

### 6.3 Casos determinísticos de reconciliação

| Evidência remota | Classificação e ação segura |
|------------------|-----------------------------|
| `ready` + branch `flow/#N-*` | Claim incompleto. Verifique assignee/PR; se é do executor e não há conflito, complete `in-progress`; senão reporte e não puxe. |
| `in-progress` sem branch remota | Claim quebrado. Pare implementação; releia assignee/PR. Complete branch somente se o executor é dono e não há trabalho divergente; caso contrário marque/reporte `anomaly`. |
| PR aberto com label/status errado | PR prevalece para o estágio; verifique head/base e então corrija para `in-review`, confirmando pós-condição. |
| PR merged + issue/status stale | Verifique `mergedAt` e vínculo; feche issue se não auto-fechou, remova status stale e marque done. |
| PR closed, `mergedAt=null` | Não é done. Classifique `blocked`/`anomaly`; decida com usuário se reabrir ou criar PR substituto. |
| Issue closed sem PR merged | Não é done. Preserve o close e reporte motivo/anomalia; reabra/retome somente após decisão explícita, mas não aplique `done` sem PR merged. |
| 2+ branches `flow/#N-*` ou 2+ PRs da issue | Ambíguo. Não escolha nem apague; liste URLs/SHAs/owners e peça decisão/handoff. |
| vários assignees ou assignee ≠ executor | Outro dono/claim ambíguo. Não puxe; exija handoff explícito no GitHub e nova reconciliação. |

Nunca corrija anomalia com force push, reset destrutivo ou deleção silenciosa de branch remota. Após qualquer reparo, releia as fontes afetadas e só então atualize caches.

### 6.4 O que entra em cada coluna (DoR / DoD)

Pense como staff engineer, não como bot de labels.

#### `backlog` — “existe, mas ainda não puxa”

Pode estar aqui se **qualquer** um for verdade:

- acceptance criteria fracos / ambíguos
- dependência de outra issue/decisão ainda aberta
- effort XL sem split
- falta de contexto de módulo (ainda não scouteado o bastante)
- bloqueio externo (acesso, design, API de terceiro)
- “talvez depois” disfarçado de task

**Ação típica no backlog:** refinar, quebrar, linkar deps, **não** codar.

#### `ready` — Definition of Ready

Só promove `backlog → ready` quando **tudo** abaixo passa:

- [ ] Título claro + summary legível
- [ ] Acceptance criteria testáveis (checkboxes)
- [ ] Área/módulos conhecidos (paths do PROJECT_MAP)
- [ ] Priority + effort estimados com evidência
- [ ] Dependências resolvidas **ou** explicitamente aceitas
- [ ] Não é XL sem split (XL volta pro backlog como epics filhos)
- [ ] Não conflita com issue/PR já abertos no mesmo pedaço
- [ ] Impacto de regressão mapeado: jornadas/contratos anteriores, testes existentes e comandos obrigatórios estão identificados
- [ ] Para features existentes afetadas, a baseline de caracterização já passa na default branch ou há uma issue predecessora explícita que a estabelecerá

**Ready ≠ compromisso de fazer agora.** Ready = “pode ser puxado sem vergonha”.

#### `in progress` — WIP real

- No máximo **1 issue in progress por executor** (default)
- **Obrigatório:** branch dedicada já criada a partir da default
- Status no GitHub atualizado **no momento** em que a branch nasce / o trabalho começa — não no fim do dia
- Comentário curto na issue com branch + intenção ajuda o board humano

#### `in review`

- PR aberto (não draft, salvo acordo)
- Validação local/CI rodada ou motivo explícito
- Issue aponta pro PR; PR tem `Closes #N` / `Fixes #N` quando for fechar no merge
- Label `status:in-review` **no mesmo passo** do `gh pr create`

#### `done`

- **Obrigatório:** PR correspondente com `mergedAt != null`; issue fechada isoladamente nunca basta
- Não deixe issue open com label done, nem PR merged com status in-progress

### 6.5 Como “assistir” o board (triagem contínua)

Em todo “continua / próxima / segue o projeto”:

1. **Ler colunas** (6.0)
2. **Detectar anomalias** e corrigir ou reportar:
   - `in progress` sem branch / branch órfã sem issue
   - `in review` sem PR
   - `ready` com deps abertas
   - 2+ `in progress` pro mesmo executor sem OK de paralelo
   - working tree suja em branch errada
   - issue P0 parada enquanto P3 está in progress
3. **Sugerir a próxima** com raciocínio de engenheiro (não só o menor número)
4. **Pedir OK** se o user não autorizou o pull nesta mensagem
5. Só então puxar

Ordem de pull default:

1. Destravar `in review` se o user pediu merge/fix de review e isso for o gargalo
2. Continuar a **mesma** issue se já há `in progress` sua (não abandonar WIP sem motivo)
3. Senão: `priority:p0` ready e desbloqueada
4. Senão: `priority:p1` ready, effort menor entre iguais
5. Senão: demais ready por priority → effort → número
6. Se **nada** ready: refine backlog (promova o que passar DoR) — **não** code do backlog cru

```md
## Board read — OWNER/REPO
| Status | Issues |
|--------|--------|
| in progress | #… |
| in review | #… (+ PR links) |
| ready | #… |
| backlog | #… (top) |

Anomalies: ...
Next recommended: #<N> — why: ...
Branch plan: `flow/#N-slug` off `main`
OK to pull?
```

---

## Phase 7 — Uma issue = uma branch (hard rule)

### 7.1 Política de branch e claim cross-chat

| Regra | Detalhe |
|-------|---------|
| 1 issue → 1 branch | Nunca misture duas issues na mesma branch |
| Base | Sempre a **default branch remota atualizada** (`origin/main`, `origin/master`, …) |
| Nome | Determinístico: `flow/#<N>-<short-slug>` (título em lowercase ASCII, não alfanumérico → `-`, trim, primeiros 40 chars) |
| Claim | Assignee único no GitHub **mais** branch remota determinística; nenhum deles isoladamente é lock |
| WIP | 1 issue por executor; resolva/estacione o WIP remoto atual antes de puxar outra |
| Sujo | Mudanças de outra issue bloqueiam troca; stash/commit/descartar só com OK |
| Cleanup | Branch local só depois do merge verificado; nunca delete branch remota silenciosamente |

Antes do claim, complete a Phase 6, classifique **todas** as branches remotas e procure qualquer `refs/heads/flow/#N-*`, branch legacy ligada à issue por PR/comentário ou PR cujo head represente o mesmo trabalho. Branch não conforme sem vínculo não vira claim por suposição; registre-a como candidata/anomalia somente quando issue, PR, commit ou convenção do repo estabelecer relação. Se já há branch/PR ligada, reconcilie e retome; não crie outra. Não puxe se outro login é assignee, se há múltiplos assignees, ou se outro WIP pertence ao executor.

Handoff exige evidência explícita no GitHub (assignee trocado e comentário/decisão identificável), árvore segura e nova reconciliação. Multi-assignee é `ambiguous`, não colaboração implícita: pare até ficar um executor responsável ou o usuário documentar uma política diferente.

### 7.2 Claim como transição + verificação de pós-condição

Git e GitHub não oferecem uma transação única. Prefira publicar primeiro a branch determinística, que torna a intenção visível, e só então editar assignee/status. Quando o user autorizar `#N`:

```bash
DEFAULT=$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name)
EXECUTOR=$(gh api user -q .login)
SLUG="<slug-determinístico-do-título>"
BRANCH="flow/#<N>-${SLUG}"

git fetch --prune origin
git status --short                         # deve estar seguro para trocar
# Pare se issue, assignee, PR ou `git ls-remote` mostrar claim/conflito.
git ls-remote --heads origin "refs/heads/flow/#<N>-*"

git checkout -b "$BRANCH" "origin/$DEFAULT"
git push -u origin "$BRANCH"              # sem force; deve reportar `[new branch]`

# Assignee + labels numa edição de issue quando possível.
gh issue edit <N> --add-assignee "$EXECUTOR" \
  --remove-label "status:ready" --remove-label "status:backlog" \
  --add-label "status:in-progress"
gh issue comment <N> --body "Flow: **in progress** on \`$BRANCH\` (base: \`$DEFAULT\`, executor: \`$EXECUTOR\`)."
```

Se o push não reportar criação de branch nova (por exemplo, outro chat venceu a corrida e o resultado foi `Everything up-to-date`), trate a branch como preexistente: pare e reconcilie, mesmo que o SHA seja igual. Se houver Project, atualize seu Status para `In progress` na mesma transição operacional usando os IDs resolvidos na Phase 6:

```bash
gh project item-edit --id "$PROJECT_ITEM_ID" --project-id "$PROJECT_ID" \
  --field-id "$STATUS_FIELD_ID" --single-select-option-id "$IN_PROGRESS_OPTION_ID"
```

Rode `flow_project_items` e confirme o valor do item; nunca presuma sucesso pelo exit code isolado. Depois **releia** issue, Project, branch remota e PRs: a pós-condição é assignee único=`$EXECUTOR`, branch remota única no SHA esperado, nenhum PR/claim conflitante e Status/label `in-progress`. Só então grave `STATE.md` e `ISSUES.md` com `lastVerifiedAt` e comece a editar código.

Se qualquer passo falhar: **pare**, releia o remoto inteiro e complete somente a parte ausente quando a propriedade continuar inequívoca. Caso contrário registre/reporte exatamente branch, assignees, status, SHA e erro. Não tente “rollback” apagando branch remota nem sobrescreva trabalho do usuário.

### 7.3 Durante o trabalho e builders

- Commits e validação final acontecem **só** na branch Flow ativa da issue.
- Antes de retomar edição em chat novo e antes de cada push, faça fetch da branch e compare seu SHA remoto com `Remote head SHA` verificado no `STATE.md`. Se o remoto avançou inesperadamente, outro chat/processo publicou trabalho: pare, reconcilie e não faça rebase/merge automático nem sobrescreva.
- Push é sempre normal, nunca force; rejeição non-fast-forward é uma barreira de concorrência e exige nova reconciliação.
- Builders operam por default na branch ativa, **sem isolamento por worktree**.
- Se isolamento for realmente necessário, declare-o antes: o builder não pode publicar a branch de worktree como branch Flow; transfira commits explicitamente para a branch `flow/#N-*` (por cherry-pick não destrutivo), valide novamente nela e confira o SHA remoto antes do PR.
- Escopo extra vira nova issue no backlog; não misture concerns.
- Após push, blocker, handoff ou mudança de SHA/stage, releia a evidência afetada e atualize `STATE.md` + `ISSUES.md`.
- Se bloquear, comente e represente o status acordado; nunca suma com o card ou libere claim apenas no cache local.

### 7.4 PR + in review como transição verificada

Rode a validação relevante na branch Flow e publique sem force. Antes de criar, confirme que não existe PR para o mesmo head/issue.

```bash
git push -u origin "$BRANCH"
PR_URL=$(gh pr create --head "$BRANCH" --base "$DEFAULT" --title "<title>" --body "$(cat <<'EOF'
## Summary
...

## Issue
Closes #<N>

## Validation
- [ ] teste novo/ajustado para o comportamento desta issue
- [ ] regressão direcionada para jornadas, contratos e issues anteriores afetadas
- [ ] suíte padrão relevante do repositório
- [ ] diagnostics clean (relevant)
- [ ] limitações de ambiente/validação, se houver, documentadas (não marcar done sem decisão explícita)

## Notes
...
EOF
)")

gh issue edit <N> --remove-label "status:in-progress" --add-label "status:in-review"
gh issue comment <N> --body "Flow: **in review** — $PR_URL"
```

Atualize Project Status, se configurado, e releia a pós-condição:

```bash
gh project item-edit --id "$PROJECT_ITEM_ID" --project-id "$PROJECT_ID" \
  --field-id "$STATUS_FIELD_ID" --single-select-option-id "$IN_REVIEW_OPTION_ID"
flow_project_items
# No item `$PROJECT_ITEM_ID`, confirme Status = In review.
```

Releia o PR e a issue: URL/número existem, `headRefName=$BRANCH`, `baseRefName=$DEFAULT`, head SHA é o validado, PR está aberto no draft/review state acordado, checks/validação estão registrados e label/Project dizem `in-review`. Review approvals continuam obrigatórios conforme proteção/política; Flow não faz merge automático. Falha de qualquer pós-condição volta para reconciliação, não para criar PR duplicado. Atualize os caches após verificação.

### 7.5 Merge, done e limpeza como transições verificadas

Depois do merge autorizado ter ocorrido, prove-o remotamente antes de marcar done:

```bash
gh pr view <PR> \
  --json number,url,state,headRefName,baseRefName,headRefOid,mergedAt,closedAt,reviewDecision,statusCheckRollup
gh issue view <N> --json number,state,labels,assignees,url
```

A pós-condição default exige `mergedAt != null`, PR/head/base esperados e checks/reviews conforme política. PR fechado com `mergedAt=null` **não** é done. Se o merge não auto-fechou a issue, feche-a explicitamente; remova labels stale (`ready`, `in-progress`, `in-review`) e aplique `done`. Se houver Project:

```bash
gh project item-edit --id "$PROJECT_ITEM_ID" --project-id "$PROJECT_ID" \
  --field-id "$STATUS_FIELD_ID" --single-select-option-id "$DONE_OPTION_ID"
flow_project_items
# No item `$PROJECT_ITEM_ID`, confirme Status = Done.
```

Releia issue/Project/PR e somente então atualize `STATE.md`/`ISSUES.md` para `done`.

Por fim, com working tree limpa, volte à default, faça `git pull --ff-only origin "$DEFAULT"` e remova apenas a branch **local** com `git branch -d "$BRANCH"`. Não esconda falha de cleanup, não force delete e não delete branch remota sem autorização/política explícita. Volte à Phase 6 antes de recomendar outra issue.

---

## Phase 8 — Implementar a issue puxada

| Issue | Caminho |
|-------|---------|
| S, local | direta / `builder` |
| M | pre-plan leve → builder(s) |
| L / multi-file | `planner` skill → builders |
| Alto risco | `/plan-heavy` path |

Sempre:

1. `agent-guide` antes de subagents
2. Scout extra se a issue exigir entendimento novo
3. Antes de editar, mapear o impacto de regressão: testes, contratos, jornadas e issues anteriores na mesma superfície
4. Criar/ajustar o teste de regressão junto da mudança sempre que praticável
5. Planner quando L/complexa
6. Antes do PR, rodar: teste novo, regressão direcionada, suíte padrão relevante e checks estáticos; não substituir testes por inspeção manual
7. Registrar os comandos e resultados no PR; se uma camada não rodar, declarar o motivo, risco e próxima ação
8. Não avançar para `done` se houver falha, teste obrigatório não executado, ou perda de cobertura material sem decisão explícita
9. Planos em `.pi/plans/` referenciando `#N`

A seleção de testes deve cobrir tanto o comportamento novo quanto os contratos já entregues que compartilhem endpoint, domínio, modelo, autorização, evento, integração ou infraestrutura. Quando a feature já existia antes da mudança, a validação começa pelos testes de caracterização da baseline e compara o comportamento legítimo esperado (request, response/status, autorização e efeitos persistidos) antes e depois da alteração. Para áreas de risco (auth, autorização/PII, dinheiro, webhooks, migrations, upload e deploy), execute também a matriz de cenários adversos aplicável; testes posteriores devem continuar executando os regressivos dessas áreas.

Exceção estreita: contenção emergencial que reduz exposição ativa pode preceder uma baseline completa somente com escopo mínimo, smoke test da jornada válida, rollback conhecido e aprovação explícita do usuário. A caracterização completa continua como dependência da próxima alteração funcional; nunca use a exceção para normalizar cobertura ausente.

Se o planner gerar plano grande: **mostre resumo e peça OK** antes de builders.

---

## Phase 9 — Modo “segue o projeto X” / continue

Quando o user **não** manda lista nova, e sim continuidade:

```txt
"segue o projeto", "continua o board", "próxima issue",
"manda ver no repo X", "o que tem ready?"
```

### Playbook

1. `cd` / confirmar repo X (path ou `owner/name`)
2. Permission gate leve (`gh issue list` ok?)
3. Rodar **re-entry remoto completo** (Phase 6): fetch/prune, Project, issues, PRs all-state, branches remotas, branch/tree local
4. Classificar/reparar ou reportar anomalias; retomar primeiro o WIP inequívoco do executor
5. Só agora ler/reconstruir `STATE.md`, `ISSUES.md` e `PROJECT_MAP.md`; cache ausente/stale nunca recria backlog
6. Emitir resume report com `lastVerifiedAt`, evidência do claim/PR/SHA e next recommended
7. Se user já disse “continua / manda / próxima” na mesma frase → isso conta como OK pra **uma** issue recomendada (ainda diga qual e o que fará)
8. Reconciliar novamente a candidata imediatamente antes do claim; puxar só se assignee/branch/PR permitirem
9. Executar cada transição com pós-condição verificada, atualizar caches e shippar
10. Após done verificado, voltar à Phase 6 e oferecer a seguinte

### O que **não** fazer no continue

- Ler cache/chat antes do remoto e tratá-lo como verdade
- Recriar backlog porque `.pi/flow`/`.pi/memory` sumiu
- Puxar issue do backlog sem DoR ou issue já reclamada por outro executor
- Continuar em branch aleatória (`main` suja, branch de outra issue)
- Avançar cards sem verificar pós-condições e atualizar Project/labels/caches

---

## Phase 10 — Relatórios

Após **cada** transição verificada — issue criada/refinada/ready, claim, push/SHA relevante, blocker/handoff, PR, review status, merge/done e cleanup — atualize `STATE.md` e a linha de `ISSUES.md`. Nunca escreva o estado desejado antes de provar a pós-condição remota.

Resume report compacto obrigatório:

```md
## Flow resume — OWNER/REPO
- Remote verified at: 2026-07-09T12:00:00Z
- Authority read: Project <number|not configured>; issues/PRs; remote branches
- Board: backlog=… ready=… in-progress=… in-review=… done=…
- Executor / WIP: login — #N | none
- Claim evidence: assignee=…; branch=flow/#N-…@<sha> | none
- PR evidence: #P <url> — OPEN|CLOSED|MERGED; head/base=…/…; checks/review=…
- Local: branch=…; tree=clean|dirty (paths summarized)
- Anomalies repaired/open: ...
- Next: resume #N | recommend #M (awaiting OK unless already authorized)
```

Artefatos:

```txt
.pi/flow/<repo-slug>/
  STATE.md           # cache canônico de re-entry; GitHub continua autoridade
  PROJECT_MAP.md
  BACKLOG.md
  ISSUES.md          # issue/status/assignee/branch/PR/last verified
  PERMISSIONS.md     # só se gate falhou
```

---

## Stop rules

Pare / eduque / pergunte quando:

- Flow chamado sem repo, sem lista e sem outcome (e sem board existente pra continuar)
- Permissão GitHub insuficiente
- PROJECT_MAP ainda não existe e alguém pede issues “já” em projeto desconhecido
- Lista ambígua no que é “implementar agora”
- Dúvida material sem OK (escopo, prioridade, split XL, auth/pay/security)
- Effort XL sem critério de split
- Working tree suja com mudanças de **outra** issue/branch
- Tentativa de reusar branch de issue A pra issue B
- Board inconsistente (in progress sem branch), claim multi-assignee, branch/PR duplicado ou handoff ambíguo
- Recuperação exigiria force push, reset destrutivo, deleção remota silenciosa ou enfraquecer aprovação/review
- Duas falhas de create/PR sem hipótese nova

---

## Anti-patterns

- Criar issues no escuro porque o user disse só “flow”
- Perguntar 15 coisas genéricas **antes** de scouter o repo
- Inventar backlog “bonito” sem pedido
- Chutar priority/effort sem PROJECT_MAP
- Pular REVIEW GATE
- Duplicar issues já abertas
- Codar direto do **backlog** sem passar por **ready**
- Dois cards in progress na mesma branch
- Confiar em `git branch -a` ou `STATE.md` como prova do remoto
- Chamar transições git+GitHub de “atômicas” ou seguir após pós-condição falhar
- Esquecer de mover e verificar Project/label quando cria branch/PR
- Publicar branch de worktree do builder como branch Flow
- Pular planner em L/XL
- Done sem PR correspondente, merge verificado, review/checks e status reconciliado
- Engolir erro de permissão
- Citar pessoas específicas no checklist de acesso (sempre genérico pro usuário)

---

## Quick start (orquestrador)

### A) Lista nova → issues
1. Educar se incompleto  
2. Permission gate  
3. Scouts por módulo → `PROJECT_MAP.md`  
4. Draft + **REVIEW GATE** → OK  
5. Labels + create issues  
6. Perguntar se puxa a primeira  

### B) Continuar projeto / board
1. Confirmar repo e executar re-entry remoto completo
2. Reconciliar Project + issues/PRs + branches remotas + estado local
3. Retomar WIP próprio ou recomendar 1 issue ready
4. OK (explícito ou “continua/próxima”)
5. Claim verificado: branch remota + assignee + `in progress`
6. Implement → validar → PR verificado → `in review` → merge verificado → `done`
7. Atualizar caches e voltar ao board

### Comando mental

```txt
/skill:flow
User: [lista] — cria issues e vamos uma a uma

/skill:flow
User: segue o projeto X / próxima issue
```

Ordem sagrada: **reler GitHub remoto → reconciliar caches → evidência do repo → propor → OK → claim de 1 issue / 1 branch → verificar e registrar cada transição → voltar ao board**.
