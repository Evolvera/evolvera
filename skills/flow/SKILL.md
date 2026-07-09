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
       → merge/close → status: done
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

## Phase 6 — Ler o kanban como engenheiro (obrigatório)

Antes de puxar qualquer issue — inclusive quando o user disser **"segue o projeto X"**, **"continua"**, **"próxima"** — **leia o board de verdade**. Não confie só na memória da sessão.

### 6.0 Snapshot do board

```bash
# Issues abertas com labels (visão kanban via labels)
gh issue list --state open --limit 100 \
  --json number,title,labels,assignees,updatedAt,url,body \
  --jq 'sort_by(.number) | .[] | {number,title,labels:[.labels[].name],url,updatedAt}'

# PRs abertos (o que já está in review de fato)
gh pr list --state open --limit 50 \
  --json number,title,headRefName,body,url,isDraft

# Branches flow locais / remotas (WIP real)
git branch -a | rg 'flow/#' || true
git status --short
git branch --show-current
```

Monte mentalmente (e em `ISSUES.md` se útil) as colunas:

| Coluna | Fonte de verdade | Significa |
|--------|------------------|-----------|
| **backlog** | `status:backlog` | Capturado, ainda **não** está pronto pra puxar |
| **ready** | `status:ready` | Definition of Ready ok — pode virar WIP |
| **in progress** | `status:in-progress` + branch `flow/#N-...` | Alguém está implementando **agora** |
| **in review** | `status:in-review` + PR aberto | Código pronto, esperando review/checks |
| **done** | `status:done` / issue closed | Entregue (default: PR merged) |

Se houver GitHub Project com Status, prefira o Project **e** mantenha labels espelhando (ou documente qual é a source of truth). Labels `status:*` são o default do Flow.

### 6.1 O que entra em cada coluna (DoR / DoD)

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

- Default: **PR merged** (ou issue fechada com close reason aceito)
- Alternativa só se user combinar: done = PR aberto + checks verdes
- Não deixe issue open com label done, nem PR merged com status in-progress

### 6.2 Como “assistir” o board (triagem contínua)

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

### 7.1 Política de branch

| Regra | Detalhe |
|-------|---------|
| 1 issue → 1 branch | Nunca misture duas issues na mesma branch |
| Base | Sempre criar a partir da **default branch atualizada** (`main`/`master`/… do repo) |
| Nome | `flow/#<N>-<short-slug>` (slug kebab, ≤ ~40 chars) |
| Vida | Branch morre no merge/close da issue; próxima issue = **nova** branch |
| Sync | Antes de criar: `git fetch` + rebase/ff da default local |
| Sujo | Se working tree tiver mudanças de outra issue → stash/commit/descartar com OK — **não** carregar lixo pra branch nova |

### 7.2 Sequência atômica ao puxar (status + branch juntos)

Quando o user der OK pra puxar `#N`:

```bash
DEFAULT=$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name)
git fetch origin "$DEFAULT"
git checkout "$DEFAULT"
git pull --ff-only origin "$DEFAULT"

# status → in progress ANTES ou imediatamente ao criar a branch (não deixe board mentir)
gh issue edit <N> --remove-label "status:ready" --remove-label "status:backlog" --add-label "status:in-progress"

SLUG="<short-slug>"
BRANCH="flow/#<N>-${SLUG}"
git checkout -b "$BRANCH"

gh issue comment <N> --body "Flow: **in progress** on `$BRANCH` (base: `$DEFAULT`)."
```

Alternativa se `gh issue develop` existir e for confiável:

```bash
gh issue develop <N> --checkout --name "flow/#<N>-${SLUG}"
# ainda assim garanta labels status:* atualizadas
```

### 7.3 Durante o trabalho

- Commits **só** na branch da issue
- Escopo da issue: se aparecer trabalho extra → nova issue no backlog, não “já que estamos aqui”
- Atualize `ISSUES.md` local (branch, PR, status)
- Se bloquear: comente na issue, mova de volta pra `ready` ou deixe `in progress` com comment de blocker — **nunca** suma com o card

### 7.4 PR + in review

```bash
git push -u origin HEAD
gh pr create --base "$DEFAULT" --title "<title>" --body "$(cat <<'EOF'
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
gh issue comment <N> --body "Flow: **in review** — PR opened."
```

### 7.5 Done + limpeza de branch

```bash
# após merge (ou conforme acordo)
gh issue edit <N> --remove-label "status:in-review" --add-label "status:done"
git checkout "$DEFAULT"
git pull --ff-only origin "$DEFAULT"
git branch -d "flow/#<N>-..." 2>/dev/null || true
# próxima issue: repita 7.2 em branch NOVA — nunca reaproveitar a branch merged pra outro card
```

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
3. Planner quando L/complexa  
4. Validar antes de PR  
5. Planos em `.pi/plans/` referenciando `#N`  

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
3. **Board read** (Phase 6) — fonte da verdade
4. Se existir `.pi/flow/<slug>/` → reler `ISSUES.md` + `PROJECT_MAP.md`; se velho, refresh com scouts focados
5. Se **não** existir flow state mas o repo já tem issues/labels → operar em cima do board GitHub (não recriar tudo)
6. Reportar board + anomalias + next recommended
7. Se user já disse “continua / manda / próxima” na mesma frase → isso conta como OK pra **uma** issue recomendada (ainda diga qual e o que fará)
8. Puxar com **nova branch** + status update
9. Ship → voltar ao board e oferecer a seguinte

### O que **não** fazer no continue

- Recriar o backlog inteiro sem necessidade
- Puxar issue do backlog sem DoR
- Continuar em branch aleatória (`main` suja, branch de outra issue)
- Avançar 3 cards sem atualizar labels

---

## Phase 10 — Relatórios

```md
## Flow status — OWNER/REPO
- Board: backlog=… ready=… in-progress=… in-review=… done=…
- Active branch: flow/#N-...
- Active issue: #N — stage
- Open PRs: ...
- Anomalies fixed/noted: ...
- Next suggested: #M (awaiting OK unless already authorized)
```

Artefatos:

```txt
.pi/flow/<repo-slug>/
  PROJECT_MAP.md
  BACKLOG.md
  ISSUES.md          # inclua branch name + PR url por issue
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
- Board inconsistente (in progress sem branch) e user quer “só code”
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
- Esquecer de mover label quando cria branch/PR
- Pular planner em L/XL
- Done sem PR/validação
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
1. Confirmar repo  
2. **Ler kanban** + anomalias  
3. Recomendar 1 issue ready  
4. OK (explícito ou “continua/próxima”)  
5. Branch nova + `in progress`  
6. Implement → PR → `in review` → `done`  
7. Voltar ao board  

### Comando mental

```txt
/skill:flow
User: [lista] — cria issues e vamos uma a uma

/skill:flow
User: segue o projeto X / próxima issue
```

Ordem sagrada: **ler board → evidência do repo → propor → OK → 1 issue / 1 branch → atualizar kanban a cada transição**.
