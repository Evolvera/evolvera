---
name: flow
description: Transform a giant implementation backlog into GitHub issues with priority/effort, then ship one-by-one through backlog → ready → in progress → in review → done with PR. Always scouts the existing repo by module first, educates when inputs are missing, proposes a plan, and only acts after explicit user OK. Use for backlog→issues→kanban delivery or a generic GitHub permission unblock checklist.
---

# Flow — Backlog → Issues → Ship

Skill operacional para transformar uma lista grande de implementação em issues do repositório, priorizar/estimar, e entregar uma por uma até PR.

**Regra de ouro:** o Flow quase sempre roda em **projeto existente** (não greenfield). Antes de perguntar ou criar issues, **entenda o repo com scouts por módulo**. Depois proponha, tire dúvidas, e só avance com **OK explícito** do usuário.

```txt
Entrada (lista / pedido / “só /skill:flow”)
  → Educar se faltar contexto (não inventar backlog)
  → Permission gate GitHub
  → Scout do projeto por módulos (evidence-first)
  → Draft de backlog + sugestões + dúvidas abertas
  → REVIEW GATE: usuário aprova (OK)
  → Criar issues (priority + effort)
  → Kanban: backlog → ready → in progress → in review → done(+PR)
  → Por issue: REVIEW GATE → planner/builder → PR
```

## Quando usar

- Usuário entrega uma lista grande do que já é pra implementar
- Quer issues reais no GitHub ligadas ao repo
- Quer prioridade + effort estimados a partir do estado atual do sistema
- Quer loop de entrega issue-a-issue até PR
- Faltam permissões e precisa de checklist genérico pro usuário repassar a quem administra o repo/org
- Usuário chama `/skill:flow` com pouco ou nenhum input — **ainda assim a skill deve educar e guiar**

---

## Princípios de interação (obrigatórios)

1. **Evidence before questions** — scoute o repo antes de bombardear o usuário. Perguntas devem ser informadas pelo que o código mostra.
2. **Never invent backlog** — sem lista/pedido claro, **não fabrique** issues. Eduque e peça o mínimo.
3. **Propose, then ask** — sempre mostre um draft (o que faria) + sugestões + dúvidas. Não execute criação em massa no escuro.
4. **Explicit OK gates** — em todo ponto irreversível (criar issues, puxar issue, abrir PR se combinado, mudar labels em lote), peça confirmação. “OK”, “pode”, “aprovo”, “manda” = go. Silêncio ≠ aprovação.
5. **Educate, don’t scold** — se o usuário veio sem nada, explique o que o Flow precisa e como fornecer, em tom colaborativo.
6. **One concern per gate** — não misture “aprova as 20 issues” com “escolhe stack” na mesma pergunta confusa; separe decisões.

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

Cada scout deve devolver: paths exatos, linhas, riscos, “o que NÃO está claro”.

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
6. **Tipo**: `feature` | `fix` | `chore` | `refactor` | `docs` | `infra`

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

| Backlog # | Issue | Priority | Effort | Status | URL |
|-----------|-------|----------|--------|--------|-----|
| 1 | #12 | P1 | M | backlog | https://... |
```

Depois de criar, reporte distribuição e **pergunte**:

> Só issues por enquanto, ou puxo a primeira (`#N`) pro planner?

Espere OK de novo se for implementar.

---

## Phase 6 — Kanban loop (uma por uma, com OK)

```txt
backlog → ready → in progress → in review → done (+PR)
```

### 6.1 Escolher a próxima

Default:

1. `priority:p0` desbloqueada  
2. `priority:p1` desbloqueada, effort menor entre iguais  
3. demais por priority → effort → número  

Não puxe dependência aberta sem acordo.

**Antes de puxar:** mini-gate se o user não tiver acabado de autorizar:

```md
Próxima sugerida: #<N> — <title> (P?, E?)
Por quê: ...
Plano: ready → in progress → [planner|builder] → PR
OK pra puxar?
```

### 6.2 `backlog` → `ready`

Só se acceptance criteria claros, deps ok, effort ≠ XL sem split.

```bash
gh issue edit <N> --remove-label "status:backlog" --add-label "status:ready"
```

### 6.3 `ready` → `in progress`

```bash
gh issue edit <N> --remove-label "status:ready" --add-label "status:in-progress"
gh issue develop <N> --checkout 2>/dev/null || git checkout -b "flow/#<N>-short-slug"
gh issue comment <N> --body "Flow: moved to **in progress**. Branch: \`flow/#<N>-...\`"
```

### 6.4 Implementar (planner no centro)

| Issue | Caminho |
|-------|---------|
| S, local | direta / `builder` |
| M | pre-plan leve → builder(s) |
| L / multi-file | `planner` skill → builders |
| Alto risco | `/plan-heavy` path |

Sempre:

1. `agent-guide` antes de subagents  
2. Scout extra se a issue exigir entendimento novo  
3. Planner quando L/complexa  
4. Validar antes de PR  
5. Branch/`Closes #N` / planos em `.pi/plans/` referenciando a issue  

Se o planner gerar plano grande: **mostre resumo e peça OK** antes de builders (alinhado à skill planner).

### 6.5 `in progress` → `in review`

```bash
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary
...

## Issue
Closes #<N>

## Validation
- [ ] tests / checks run
- [ ] diagnostics clean (relevant)

## Notes
...
EOF
)"

gh issue edit <N> --remove-label "status:in-progress" --add-label "status:in-review"
```

### 6.6 `in review` → `done`

- Default: **done = PR merged** (ou close aceito)
- Alternativa só se o user combinar: done = PR aberto + checks ok

```bash
gh issue edit <N> --remove-label "status:in-review" --add-label "status:done"
```

### 6.7 Próxima

Volte a 6.1. Uma issue `in progress` por executor, salvo paralelo explícito + OK.

---

## Phase 7 — Relatórios

```md
## Flow status — OWNER/REPO
- Created: N issues
- By priority: P0=x P1=y ...
- By status: backlog=… ready=… in-progress=… in-review=… done=…
- Now: #<N> — stage
- Blockers / open questions: ...
- Next suggested: #<M> (awaiting OK)
```

Artefatos:

```txt
.pi/flow/<repo-slug>/
  PROJECT_MAP.md
  BACKLOG.md
  ISSUES.md
  PERMISSIONS.md   # só se gate falhou
```

---

## Stop rules

Pare / eduque / pergunte quando:

- Flow chamado sem repo, sem lista e sem outcome
- Permissão GitHub insuficiente
- PROJECT_MAP ainda não existe e alguém pede issues “já”
- Lista ambígua no que é “implementar agora”
- Dúvida material sem OK (escopo, prioridade, split XL, auth/pay/security)
- Effort XL sem critério de split
- Working tree suja com mudanças não relacionadas
- Duas falhas de create/PR sem hipótese nova

---

## Anti-patterns

- Criar issues no escuro porque o user disse só “flow”
- Perguntar 15 coisas genéricas **antes** de scouter o repo
- Inventar backlog “bonito” sem pedido
- Chutar priority/effort sem PROJECT_MAP
- Pular REVIEW GATE
- Duplicar issues já abertas
- Pular planner em L/XL
- Done sem PR/validação
- Engolir erro de permissão
- Citar pessoas específicas no checklist de acesso (sempre genérico pro usuário)

---

## Quick start (orquestrador)

1. Se input incompleto → **educar** + pedir mínimo (repo + lista/outcome)  
2. Permission gate  
3. **Scouts por módulo** → `PROJECT_MAP.md`  
4. Normalizar + estimar → draft  
5. **REVIEW GATE** (proposal + sugestões + dúvidas) → esperar **OK**  
6. Labels + `gh issue create` → `ISSUES.md`  
7. Perguntar se puxa a primeira → OK → planner/builder → PR → kanban  
8. Repetir com OK por issue  

### Comando mental

```txt
/skill:flow
# ou
/skill:flow
User: [lista] — cria issues e vamos uma a uma
```

Mesmo com lista, a ordem é: **mapear repo → propor → OK → criar**.
