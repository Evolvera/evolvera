---
name: flow-orca
description: "Use automatically for GitHub issue/board delivery, branch-per-issue campaigns, or coordinated PI issue workers in Orca worktrees; the user need not name this skill. GitHub owns the campaign grant, acceptance, dependencies and Status; Orca owns one workspace, real branch and PI session per issue. Supports autonomous campaign re-entry, event-driven worker completion without polling, and safely authorized cleanup after verified merge/Done. Scouts new backlogs first; approved campaigns dispatch directly under the per-repository bases, campaign mode and twelve-worker ceiling. Not for simple worktree creation, unsupervised ownership handoffs, or standalone explanations."
---

# Flow Orca — Backlog → Issues → Campanha → Ship

Skill operacional única de entrega por issue. Transforma uma lista grande de implementação em issues de um GitHub Project, prioriza/estima, e entrega como **campanha aprovada** na qual o **Orca** cria um workspace, uma branch real e uma sessão PI por issue.

**Regra de ouro:** esta skill quase sempre roda em **projeto existente** (não greenfield). Backlog novo: **entenda o repo com scouts por módulo**, proponha e obtenha aprovação no intake. Campanha já aprovada: vá direto às Phases 6/7, sem repetir scout/proposta/intake; prepare o handoff antes de abrir o PI e termine seu dispatch antes de abrir outro. Preserve os gates do modo e de segurança.

```txt
Entrada (lista / “segue o projeto X” / “próxima issue” / “o que dá para rodar junto?” / só `/skill:flow-orca`)
  → Educar se faltar contexto (não inventar backlog)
  → Permission gate GitHub + preflight Orca (executável resolvido, os dois guias live, `status --json`)
  → Ler o kanban atual (Project + issues + PRs) e inventariar workspaces/terminais Orca já existentes
  → Backlog novo: scout por módulos + proposta/intake; campanha aprovada: direto às Phases 6/7
  → Draft de backlog + candidatos a epic/área + dúvidas abertas
  → REVIEW GATE: usuário aprova (Project + issues + hierarquia)
  → INTAKE DA CAMPANHA: base branch POR REPOSITÓRIO + o modo resolvido (SUPERVISIONADO | AUTÔNOMO | YOLO; default AUTÔNOMO) + limites
  → Reusar/criar Project, linkar repo(s), configurar Kanban (Backlog, Ready, In progress, In review, Blocked, Done)
  → Criar/atualizar epics e issues-filhas como cards (priority + effort + status) e verificar sub-issues nativas
  → Registrar o grant de campanha no **README do GitHub Project** e as ACs/dependências/escopos nos **bodies das issues**
  → Derivar ordem topológica, gates e candidatos **em memória**, sempre a partir de uma releitura do GitHub
  → Analisar dependências externas primeiro: bloqueio vira comentário na issue + Project `Blocked`; pula a issue e seus dependentes
  → Scheduler contínuo e work-conserving, teto de DOZE PIs de issue simultâneos no total:
       admissão serial do coordenador único (intenção visível no GitHub + releitura antes do dispatch)
       → `worktree create … --issue <N> --base-branch <base do repo> --no-parent --agent pi`
       → adotar o terminal PI exato em `orchestration worker-start --terminal` e ativar `/goal <objetivo da Task>` imediatamente
       → Project: `In progress` (atualizar **e reler**)
       → PI implementa dentro do workspace da issue → commit/push → PR contra a base escolhida
       → Project: `In review` + review independente no head SHA final
       → merge serial autorizado na base escolhida → `mergedAt` real → issue fechada → `Done` (atualizar **e reler**)
       → assentar (Goal finalizado, terminal liberado/retido) → vaga volta ao scheduler
       → cleanup condicional da worktree descartável só com autoridade + prova (7.6); senão retida com motivo
  → Voltar ao board
```

## Quando usar

**Acione automaticamente, sem exigir `/skill:flow-orca` ou que o usuário lembre o nome**, quando o pedido for entrega/continuação por issues ou board do GitHub, campanha branch-per-issue, ou coordenação de workers PI de issues em worktrees Orca com retorno de resultados e integração. Carregue esta skill **antes** de criar Run/Task/workspace ou iniciar a coordenação; não substitua a campanha por `orca-cli`, `orchestration` isolada ou subagents sem provenance Orca. Os guias live do Orca continuam sendo usados como interfaces, não como workflow concorrente. Acionamento não concede autorização: pergunta apenas informativa (`o que dá para rodar junto?`) termina na recomendação read-only, salvo entrega já autorizada em curso.

**Não acione para** criação simples de worktree/terminal, handoff completo sem supervisão, operação pontual já ordenada em artefatos prontos, ou explicação isolada sem campanha: mantenha `orca-cli`/`orchestration` ou o caminho direto conforme o pedido. Não invente GitHub Project/issues para esses casos.

- Usuário entrega uma lista grande do que já é pra implementar
- Quer issues reais no GitHub ligadas ao(s) repo(s)
- Quer prioridade + effort estimados a partir do estado atual do sistema
- Quer entrega por issue até PR/merge com workspaces Orca e sessões PI
- Diz **“segue o projeto X”**, **“continua o board”**, **“próxima issue”**, **“o que tem ready?”**, **“o que dá para rodar junto?”** ou **“pega outra sem conflitar”**
- Faltam permissões e precisa de checklist genérico pro usuário repassar a quem administra o repo/org
- Usuário chama `/skill:flow-orca` com pouco ou nenhum input — **ainda assim a skill deve educar e guiar**

---

## Princípios de interação (obrigatórios)

1. **Evidence before questions** — scoute o repo antes de bombardear o usuário. Perguntas devem ser informadas pelo que o código mostra.
2. **Never invent backlog** — sem lista/pedido claro **e** sem board existente, **não fabrique** issues. Eduque e peça o mínimo.
3. **Propose, then ask** — sempre mostre um draft (o que faria) + sugestões + dúvidas. Não execute criação em massa no escuro.
4. **Gates explícitos, com escopo de campanha** — antes da campanha, todo ponto irreversível (criar Project/issues, hierarquia, labels em lote) pede confirmação; “OK”, “pode”, “aprovo”, “manda”, “continua”, “próxima” = go **para o passo pedido**; silêncio ≠ aprovação. Depois do intake, um **grant de campanha** é pedido explícito das ações, alvos e métodos nomeados: não repita a mesma pergunta enquanto escopo, alvo, método e evidência continuarem os mesmos. Mudança de grant, efeito destrutivo consequente, recurso não descartável ou incidente restauram os gates exatos.
5. **Educate, don’t scold** — se o usuário veio sem nada, explique o que o Flow precisa e como fornecer, em tom colaborativo.
6. **One concern per gate** — não misture “aprova as 20 issues” com “escolhe stack” na mesma pergunta confusa; separe decisões.
7. **Read the board first** — em continue/próxima, leia issues+labels+PRs+branches antes de codar.
8. **1 issue = 1 workspace Orca = 1 branch real** — a branch nasce do `worktree create` do Orca a partir da **base escolhida para aquele repositório**; leia ID e branch **reais** da resposta e nunca calcule a branch pelo nome do workspace. Nunca reutilize workspace/branch de outra issue. Atualize **e releia** o Project na hora de cada transição (Ready → In progress → In review/Blocked → Done).
9. **Teto de doze PIs de issue simultâneos** — o scheduler é contínuo e work-conserving em todos os repos/hosts da campanha; doze é teto, não demanda. Um único writer por workspace de issue. A vaga só volta quando aquele writer estiver **settled com segurança**; timeout, silêncio ou terminal ocioso nunca liberam vaga.
10. **GitHub é autoridade; Orca é evidência viva de execução; cache continua cache** — precedência: **GitHub Project Status → issue/assignee + claim marker + PR → branch remota/SHA → workspaces/terminais/dispatches do Orca → `.pi/flow/` → `.pi/memory/`/chat**. Uma leitura nova substitui estado antigo. Workspace prova checkout e ligação de issue, não resultado entregue; cache, chat e idade nunca são claim, lock ou autorização de takeover. `.pi/flow/` é **histórico/cache opcional e somente-leitura, sem autoridade nenhuma**: sua ausência nunca bloqueia re-entry, e grants ou planos antigos ali guardados nunca são migrados nem publicados automaticamente.
11. **Regressão cumulativa é obrigatória** — toda issue preserva e executa a suíte relevante já existente; novos testes de regressão/contrato entram na mesma entrega sempre que a mudança corrigir ou proteger comportamento. Uma issue posterior só avança se provar que não quebrou os fluxos anteriores afetados. Falha, lacuna material de cobertura ou teste não executável mantém a issue bloqueada/em review, nunca done.
12. **Caracterizar antes de alterar** — quando uma feature existente e funcional não tem cobertura suficiente, criar primeiro uma baseline de caracterização: catálogo de jornadas válidas, contratos, status/respostas e efeitos persistidos, com fixtures sintéticas e ambiente isolado. Mudanças funcionais na mesma superfície dependem dessa baseline passar na base escolhida daquele repositório. A baseline preserva comportamento legítimo, não vulnerabilidades, bypasses ou bugs conhecidos.
13. **Project/Kanban é obrigatório para a entrega** — ao criar issues, reusar um único GitHub Project aberto que governe o escopo ou propor um Project novo; criar, linkar repositórios e configurar o board somente após **OK explícito** para o nome, owner, repos e colunas mostrados no proposal. As colunas são `Backlog`, `Ready`, `In progress`, `In review`, `Blocked` e `Done`; `Blocked` é aditivo e preserva todos os outros status e fields já configurados. Cada issue entra como card em `Backlog`. Não criar issues soltas usando apenas labels, salvo pedido explícito. O Project é o kanban visual e a autoridade operacional; labels permanecem espelho/fallback técnico.
14. **DAG adaptativo derivado do GitHub e work-conserving** — ordem topológica, gates, hazards e oportunidades de concorrência são **derivados em memória** a cada releitura do GitHub (dependências e gate declarados no body de cada issue), nunca de um plano local obrigatório. Nenhum arquivo local de plano/schedule/DAG/índice/estado precisa ser produzido ou reconciliado. O DAG ordena dependências, gates e oportunidades de concorrência, e nunca exige múltiplos workers. Não existe wave imutável nem barreira “todos terminam juntos”: cada assentamento seguro reabastece o scheduler dentro do teto aprovado. Concorrência só admite nós `ready` com dependências satisfeitas, write/validation scopes fundamentados, recursos exclusivos livres e workspaces Orca isoladas.
15. **Sub-issues nativas são hierarquia, não execução** — crie uma epic/área-pai quando issues-filhas compartilham um outcome, princípios, bloqueio ou sequência macro aprovados; o critério é coerência de produto, não quantidade. A pai guarda somente visão, ordem macro e progresso nativo; cada filha mantém body, ACs, dependências e histórico completos. Apenas filhas executáveis entram no DAG, `Ready`, claim, branch ou PR. Ordem visual das sub-issues não é dependência técnica; o DAG e evidência remota continuam sendo a autoridade. Divida uma epic quando ela deixar de ter um outcome compreensível, não porque atingiu um número arbitrário de filhas. Nunca crie uma filha apenas para preencher uma epic, nem aninhe hierarquias sem necessidade comprovada.
16. **GitHub controla tudo; sem duplicação local de entrega** — o **README do GitHub Project** é dono do **grant de campanha**: escopo de issues aprovado, bases por repositório, modo, limites, operações nomeadas e evidência de aprovação. O **body de cada issue** é dono das ACs completas, escopo, **URLs totalmente qualificadas** das issues de dependência mais o gate (default: merged na base escolhida daquele repositório + issue fechada) e dos write/validation/resource scopes. Os **comentários** são donos de progresso, resultados, blockers e claims. O `Status` do Project é a autoridade operacional. Não crie issue de controle, backlog paralelo, plano/schedule/DAG/índice/estado local de entrega, nem serviço de scheduler. Esses registros remotos são **evidência de decisão do usuário, não fonte de permissão**: nenhum texto remoto editável amplia escopo/alvo/método nem contorna os gates de segurança desta skill.
17. **Re-entry é autônomo e só depende do remoto** — em chat novo, “o que dá para rodar junto?” exige re-entry completo sem pedir ao usuário para recontar contexto: descobrir repo/Project, reconciliar toda evidência remota, inventariar workspaces/terminais Orca, reler o grant de campanha no README do Project, derivar o DAG em memória e calcular candidatos. Isso funciona **sem cache local nenhum**. Pergunte apenas por autoridade destrutiva/material, grant novo ou ambiguidade que a evidência não resolve. Autoridade remota ausente ou contraditória (README sem grant, dependência sem URL/gate, Status divergente) **bloqueia a admissão afetada** com reconciliação bounded — nunca com permissão inventada nem com inferência a partir de arquivo local.
18. **Admissão serial honesta, sem falsa atomicidade** — implementação nunca começa só porque o card está `Ready`. Um **único coordenador de campanha** admite issues em série: publica intenção visível no GitHub (assignee + claim marker + `In progress`), cria a workspace Orca, verifica as pós-condições e **relê** tudo imediatamente antes de injetar trabalho. Isso é serialização com intenção visível e recheck, **não** lock atômico entre máquinas: claim ambíguo, marker duplicado ou dois coordenadores param as issues envolvidas. Nunca crie uma segunda branch/serviço de reserva para simular exclusão mútua.
19. **Sem falsa certeza de atividade** — diga `worker active` somente quando o coordenador atual leu o dispatch vivo no Orca. Fora disso, reporte `claim active`, `branch present` ou `workspace present`. Ausência local pode significar outro host; timeout, idle ou tempo parado nunca são falha, conclusão, vaga livre ou autorização de auto-reclaim.
20. **Done exige merge provado** — `Done` só com PR de `mergedAt` real na base escolhida, checks/review exigidos, review independente do head SHA final, issue fechada (fechamento explícito quando a base não é a default e o GitHub não auto-fecha) e status relido coerente. `worker_done`, exit verde, task `completed`, PR fechado sem merge ou AC de deploy incompleta **não** são Done.
21. **Incidente congela** — qualquer pós-estado inesperado (mutação não prevista, efeito fora do alvo, resultado contraditório) suspende as autorizações de mutação dos recursos afetados, inclusive limpeza, restore, reseed e cleanup em `finally`. Só diagnóstico read-only até nova autorização explícita; trabalho não afetado continua apenas com isolamento provado.

---

## Cold start — usuário chamou a skill sem nada / faltando coisa

Se a mensagem for só `/skill:flow-orca`, “roda a campanha”, ou vier incompleta, **não saia criando issues nem workspaces**.

### 1) Detectar o que falta

| Peça | Como detectar |
|------|----------------|
| Repo git local | `git rev-parse --show-toplevel` |
| Remote GitHub | `gh repo view` / `git remote -v` |
| Lista de implementação | body do user, arquivo citado, issue board existente |
| Permissão write | `viewerPermission` + teste de list/create |
| Working tree limpa o suficiente | `git status --short` |
| Orca disponível | executável resolvido + `status --json` (Phase 0) |
| Base por repositório e modo da campanha | Base explicitamente escolhida no intake; modo global já resolvido (Phase 4.1) |

### 2) Educar com template curto

```md
## Flow Orca — o que eu preciso pra rodar bem

Estou no repo: `OWNER/REPO` (ou: **não achei repo git aqui**).

### Já tenho
- Modo aplicado: <modo global resolvido; default AUTÔNOMO, sem pergunta separada>
- ...

### Falta
- [ ] Lista do que é **pra implementar agora** (não ideias soltas)
- [ ] Base branch de cada repositório do escopo (não assumo `main`)
- [ ] ...

### Como me passar a lista (qualquer formato)
1. Cola no chat (bullets / numerada)
2. Aponta um arquivo (`TODO.md`, plan, notes)
3. Diz “usa as issues abertas do repo e reorganiza”
4. Diz o outcome (“quero X funcionando”) e eu derivo um draft **depois** de scouter o código

### O que eu vou fazer depois que tiver o mínimo
1. Mapear o projeto por módulos (scouts)
2. Normalizar backlog + priority/effort sugeridos
3. Te mostrar o plano, o intake da campanha e as dúvidas
4. Só criar issues / abrir workspace depois do teu **OK**

Me manda a lista (ou o outcome) e confirma se o repo acima é o certo.
```

### 3) Se não estiver em um repo

Pare. Peça:

- `cd` para o projeto, **ou**
- path do repo local, **ou**
- `owner/name` + clone se fizer sentido

A skill **assume projeto no disco** para scouts. Não invente estrutura de app.

### 4) Se tiver outcome mas sem lista

OK parcial: rode scouts → proponha backlog draft a partir do código + outcome → **ainda assim** peça OK antes de criar issues.

---

## Phase 0 — Repo + Permission Gate + preflight Orca

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

`defaultBranchRef` é informação, **não** escolha: a base de cada repositório vem do intake (Phase 4.1).

### Preflight Orca (obrigatório antes de qualquer execução de issue)

1. Resolva o executável uma vez e reutilize: `ORCA_CLI_COMMAND` se definido; senão `orca-dev` quando a sessão expõe `ORCA_DEV_REPO_ROOT`; senão, em Linux fora de um terminal gerenciado pelo Orca, `orca-ide` (nunca o `orca` do GNOME screen reader); senão `orca`. Se o executável escolhido falhar, reporte o erro exato e pare — não caia para outro binário.
2. Carregue **os dois guias live desta versão** a cada sessão, sem fallback e sem cópia em cache: `ORCA skills get orca-cli` e `ORCA skills get orchestration`. Guia ausente/ilegal é `BLOCKED`, não permissão para adivinhar subcomando ou flag. Nada aqui substitui o guia: esta skill descreve política, e o guia da versão em execução descreve a interface. O stub instalado pode ser mais novo que o binário. Se precisar de detalhe adicional, consulte `ORCA skills get --help`: use a referência/tópico suportado ou `ORCA skills get orchestration --full`. Não tente repetidamente `--reference`/`--references` quando a versão só oferece `--topic`/`--full`; carregue detalhes somente quando a operação precisar deles.
3. Confirme disponibilidade com `ORCA status --json`; se o app não estiver de pé, use o caminho de abertura documentado no guia. Prefira `--json` em toda chamada.
4. Inventarie o que já existe antes de propor qualquer coisa (`worktree ps --json`, `terminal list --json`). Workspaces, terminais e reservas **não relacionados à campanha permanecem intocados**.
5. **Wake automático por evento (evidência fresca).** Antes do primeiro dispatch, prove que o Run da campanha está vinculado ao PI coordenador exato e que o runtime expõe estado vivo/idle legível desse terminal (status/guia live da versão). A prova de fonte vem da versão instalada verificada e não promete toda instalação Orca/PI: suporte, status ou vínculo ausentes = wake automático **não verificado** (lacuna de capacidade a reportar, nunca falha de worker). Veja 7.4.

Sem preflight completo não há dispatch. É legítimo criar/refinar backlog, Project e DAG mesmo sem Orca disponível; a execução de issue é que fica bloqueada.

### Permissões mínimas

| Ação | Precisa |
|------|---------|
| Listar issues | `repo` (ou public read) |
| Criar issues | write no repo |
| Criar labels | write no repo (admin/maintain ideal) |
| Abrir PR | write + push de branch |
| Criar, linkar e configurar Project; mover cards | escopo `project` + write no owner do Project (**obrigatório** para criar issues nesta skill) |

### Se faltar permissão

**NÃO invente workarounds silenciosos.** Entregue checklist **genérico para o usuário** (sem nomes de pessoa). O usuário repassa a quem administra o repo/org.

```md
# Unblock checklist — Flow Orca (repo: OWNER/REPO)

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

Apresente o checklist de acesso no chat; quando já existir uma issue afetada acessível, registre nela o blocker autorizado. Não grave nem sobrescreva arquivos no histórico `.pi/flow/`.

---

## Phase 1 — Entender o projeto (scouts por módulo) **ANTES** de perguntar

> Projetos reais não são greenfield. **Proibido** montar backlog sério ou questionário gordo sem mapear o código. **Escopo desta fase:** é *intake* (backlog novo ou uma fronteira específica ainda não resolvida), não pré-requisito de cada issue já contratada: continue/execução aprovada segue Phase 6/7 e não abre novo ciclo de scout de módulo/proposta/intake.

### 1.1 Shape rápido (orquestrador, sem agent se for barato)

```bash
ls -la
find . -maxdepth 2 -type f -name 'package.json' -o -name 'pyproject.toml' -o -name 'go.mod' -o -name 'Cargo.toml' -o -name 'README*' 2>/dev/null
```

Identifique stack, entrypoints, pastas top-level.

### 1.2 Scouts por módulo (obrigatório se >3 arquivos de entendimento)

Carregue `agent-guide` + `scout`. O coordenador aprende apenas fatos que mudam decisão (escopo, dependência, hazard, autoridade); descoberta de implementação dentro de um escopo de issue já estabelecido pertence ao PI atribuído, mas DoR/escopo ausente continua bloqueando o dispatch — nunca terceirize descoberta vaga ao agente. Prefira **vários scouts paralelos e estreitos** por módulo/ângulo:

| Scout | Pergunta típica |
|-------|-----------------|
| shape | estrutura top-level, stack, scripts, deploy |
| domain A | como funciona o módulo X (paths, entry, deps) |
| domain B | módulo Y… |
| data/auth | models, DB, auth, tenancy se existirem |
| tests/ci | como validar, pipelines, quality gates |
| existing issues | issues/PRs abertos que se sobrepõem ao backlog |

Cada scout deve devolver: paths exatos, linhas, riscos, “o que NÃO está claro”. O scout de testes/CI também deve inventariar a cobertura realmente executável por jornada (unit, integração, contrato, E2E/smoke, browser/app e manual), apontar features funcionais sem proteção e recomendar a baseline mínima antes de mudanças naquela superfície. Quando houver frontend, o inventário inclui build/typecheck/lint, smoke das rotas afetadas, falhas de rede e erros `console.error`/exceções não esperadas durante as jornadas críticas.

### 1.3 Síntese local

Apresente no chat o mapa fundamentado abaixo; não crie um arquivo local de controle. Publique nas issues aprovadas somente os requisitos, escopos e evidências pertinentes:

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

Se a cobertura de uma feature funcional existente for ausente ou insuficiente, o backlog deve conter uma issue de **baseline de caracterização** antes das mudanças que possam afetá-la. Essa issue deve: catalogar comportamento válido versus bugs/vulnerabilidades conhecidos; automatizar primeiro as jornadas Tier 0 (auth, dinheiro, dados críticos) e depois as jornadas core; usar banco/fixtures e providers fake; e provar que a baseline passa na branch default. Quando a superfície incluir frontend, a baseline também cobre build/typecheck/lint, navegação e interação das jornadas afetadas, contratos de rede e ausência de `console.error`/exceções inesperadas; avisos conhecidos só podem ser tolerados se forem documentados e tiverem issue de acompanhamento. As issues posteriores devem depender dela.

### Dedup e corte

- Mesclar duplicatas (entre si e com issues GitHub já abertas)
- Agrupar issues-filhas shippable sob uma epic quando elas compartilham outcome, princípios, bloqueio ou sequência macro; nesse caso, propor uma única epic-pai com label `epic` e uma label `area:*` já existente ou explicitamente aprovada
- O corpo da epic deve caber em visão de produto: objetivo macro, princípios, ordem macro, bloqueios compartilhados e o que está fora. A filha continua sendo a fonte de verdade para ACs, write scope, dependências e evidência de entrega
- Não usar epic/sub-issue para uma única issue, para agrupar apenas por etiqueta, ou como substituto de dependência técnica; a filha mantém todas as ACs e o DAG mantém a ordem real
- Marcar `blocked` se depender de decisão externa
- Não criar issue para “pesquisar depois” sem outcome

Apresente o rascunho da proposta no chat, sem criar arquivo local; a issue criada no GitHub é que passa a valer:

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

Não chute no vácuo. Use o mapa do projeto apresentado no chat + evidência:

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
## Flow Orca proposal — OWNER/REPO

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
- Project/Kanban: reusar `Project <url>` **ou** criar `<nome>` sob `<owner>`, linkar `<repo(s)>`, configurar colunas Backlog → Ready → In progress → In review → Blocked → Done e exibir Priority/Effort
- Labels: criar padrão **como espelho do Project** ou reusar as do repo (`…`)
- Dependências externas detectadas (conta, credencial, acesso, decisão humana, provider): issue X precisa de `<ação do usuário>` → entra como `Blocked`, junto com seus dependentes
- Hierarquia nativa proposta: nenhuma **ou** `#<epic>` com filhas `#…`; mostrar por que o agrupamento é uma área/outcome real, a ordem macro e quais labels `epic`/`area:*` serão reutilizadas ou criadas

### Fora de escopo / later
- ...

### Dúvidas que precisam do teu OK (tudo que não está 100%)
1. ...
2. ...

### Assumptions se você só disser “OK” sem detalhar
- ...

### Próximo passo se aprovar
- Reusar/criar o Project indicado, linkar todos os repositórios do escopo e verificar o board com colunas `Backlog → Ready → In progress → In review → Blocked → Done`
- Criar labels (se necessário), issues e cards correspondentes no Project, todos em `Backlog`
- Fechar o **intake da campanha** (base por repositório + modo + limites) antes de qualquer execução

Responde com **OK** (e ajustes se quiser), ou corrige a lista.
```

### Regras do gate

- Sem OK → **zero** `gh project create`, `gh project link`, `gh issue create`, criação de labels ou vínculo de sub-issue
- O OK só cobre Project/Kanban, links de repo, issues/cards e hierarquia nativa quando nome, owner, repos, colunas, escopo, epic-pai e filhas estiverem explicitamente mostrados no proposal; se qualquer um desses pontos estiver ausente ou mudar materialmente, pare e peça nova confirmação
- Se faltar escopo `project`, owner ou acesso para configurar o board, bloqueie a criação das issues e entregue o checklist de permissão; não espalhe issues apenas com labels sem o opt-out explícito do usuário
- Se o user ajustar 2 itens → atualize draft e **reconfirme** se a mudança for material
- Se disser “OK cria e já puxa a primeira” → isso cobre create + start da #1; ainda confirme acceptance da #1 se estiver vaga e feche o intake da campanha antes do primeiro workspace
- Eduque se o user pedir “só cria tudo agora” com lista ambígua: mostre o risco e peça o mínimo de clareza nos itens P0/P1

### 4.1 Intake da campanha (base por repositório + modo) — obrigatório antes de executar

Para uma campanha nova aprovada, o modo vem do owner de runtime `extensions/execution-mode.ts`: leia e registre o receipt verificado `EXECUTION_MODE={"mode":"…","source":"…"}` injetado pela sessão coordenadora. O enum canônico continua `SUPERVISIONADO | AUTÔNOMO | YOLO`, com default `AUTÔNOMO`; normalize o grant para `supervised|autonomous|yolo` antes do pin no terminal (`AUTÔNOMO ATÉ PR` → `autonomous`) e não faça uma pergunta separada de escolha de modo. O modo default **não autoriza a campanha por si só** — continue exigindo um grant de campanha explícito e escopado. `AUTÔNOMO ATÉ PR` continua aceito como **alias legado** de `AUTÔNOMO`, com a mesma fronteira de não fazer merge automático. Grants existentes válidos permanecem como estão: nenhuma migração remota, nenhuma reescrita de registro antigo. Preferências de runtime não são grants nem podem elevar um grant existente; para grants existentes, o modo e o escopo registrados no GitHub continuam sendo a autoridade.

Registre, em uma única decisão do usuário, o **grant de campanha**: escopo e conjunto de issues; **base branch escolhida para cada repositório**; modo; limite de PIs simultâneos (`≤ 6`); operações permitidas; e, quando houver deploy/migração autorizada, as identidades de ambiente, métodos, limites de blast radius e caminho de recuperação. Nunca assuma `main`/default e nunca pergunte de novo enquanto ação, alvo, método e evidência continuarem os mesmos — inclusive após resume em chat novo.

| Modo | O que o grant cobre | O que continua exigindo gate exato |
|------|---------------------|------------------------------------|
| **SUPERVISIONADO** | Análise, board, DAG e propostas | Cada início de issue, cada commit, cada push e cada PR individualmente |
| **AUTÔNOMO** (alias legado: **AUTÔNOMO ATÉ PR**) | Agendar issues do conjunto aprovado, criar workspaces Orca, implementar, commitar, dar push e abrir PR contra a base escolhida | Merge, deploy, migração, qualquer efeito destrutivo ou recurso não descartável, mudança de escopo/base/modo |
| **YOLO** | Tudo do modo anterior **mais** merge, após review independente do head SHA final e checks exigidos; e as operações de deploy/migração **separadamente nomeadas e aprovadas** | Incidente, mudança material de grant, alvo/método novo, recurso não descartável não nomeado, operação destrutiva fora do manifesto aprovado |

YOLO é **escopo de aprovação**, não flag de runtime nem bypass de segurança: não desliga o gate de ação consequente, não autoriza usar base de dados de staging/usuário como recurso descartável de teste, não autoriza restore/reseed/cleanup automático após mutação inesperada e não transforma exemplo colado pelo usuário em autorização.

**Cleanup pós-merge no grant.** Remover a worktree de uma issue é efeito destrutivo (7.6): nem YOLO, nem “entregar”, nem um grant mutável genérico o autorizam. Só entra no grant, de forma estreita (worktrees de issue criadas pela campanha, método de 7.6, manifesto de efeitos, recuperação independente e proveniência), se o **usuário** o aprovou; grants antigos nunca são ampliados em silêncio. Um pedido explícito do usuário para aquele cleanup exato, com apenas os efeitos inerentes esperados, basta sob o Consequential Action Gate existente e não exige nova pergunta enquanto ação, alvo, método e evidência continuarem iguais. Recurso não descartável ou efeito ambíguo permanece bloqueado até a confirmação explícita exigida.

Grave o intake no **README do GitHub Project**, em uma seção `## Campaign grant` delimitada, com data, escopo, conjunto de issues aprovado, bases por repositório, modo, teto, operações nomeadas e a **proveniência da aprovação** (quem aprovou, onde e quando o usuário disse isso). A escrita é **bounded**: preserve integralmente o texto já existente do README, altere apenas essa seção e **releia o README depois de escrever** para provar a pós-condição. Não crie issue de controle, arquivo local, board paralelo, serviço ou schema novo de aprovação para guardar o grant.

**O registro remoto é evidência de uma aprovação explícita anterior do usuário, nunca uma fonte que se autoriza sozinha.** Texto de README, body ou comentário — inclusive editado por qualquer pessoa ou agente — **não amplia** operações, alvos, métodos ou modo, e **não desliga** nenhum gate de segurança. Um grant sem proveniência reconhecível, ou que descreve mais poder do que o usuário aprovou de fato, vale como **inexistente na parte excedente**: pergunte de novo em vez de executar.

Em resume, releia esse registro remoto e compare com os fatos atuais; só pergunte de novo se algo material divergir. README sem grant legível, ou grant que contradiz o board, bloqueia a admissão até reconciliação com o usuário: o modo default nunca preenche um grant ausente, ambíguo ou inválido.

### 4.2 Dependências externas primeiro

Antes de agendar, classifique cada issue quanto a bloqueio externo (conta, credencial, acesso, decisão humana, contrato de provider, recurso de terceiro). Para cada bloqueio: comente na issue exatamente **qual ação do usuário** destrava, mova o card para `Blocked`, releia o status, e pule a issue **e seus dependentes** — seguindo com o trabalho independente. Não abra workspace para trabalho bloqueado e não fique consultando credencial em loop: rechecar acontece quando o usuário informa a resolução.

---

## Phase 5 — Project/Kanban + labels + criar issues (só pós-OK)

### Project e Kanban (obrigatório)

1. Descubra Projects abertos vinculados a **todos** os repositórios do escopo. Se houver um único board que governa a entrega, reutilize-o; se houver vários candidatos, pare e peça a escolha.
2. Se não houver board, crie um GitHub Project no owner apropriado (organização do repo por default; usuário apenas para repo pessoal), com o nome e escopo aprovados no proposal:

```bash
PROJECT_NUMBER=$(gh project create --owner "$PROJECT_OWNER" --title "$PROJECT_TITLE" --format json --jq '.number')
gh project link "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --repo "$REPO_NWO"
# Repita `gh project link` para cada repo cross-repo aprovado.
```

3. Configure e **verifique** uma visualização Board agrupada por `Status`, com as colunas exatas `Backlog`, `Ready`, `In progress`, `In review`, `Blocked`, `Done`; crie/exiba os campos `Priority` e `Effort`. Em board já existente, `Blocked` é **aditivo**: adicione a opção sem renomear, remover ou reordenar destrutivamente os status e fields já configurados. Use a UI/API do GitHub quando o CLI não conseguir editar as opções do campo e releia fields/items depois — não presuma a configuração pelo exit code.
4. Depois da criação de cada issue, adicione sua URL como item do Project, defina `Status=Backlog`, `Priority` e `Effort`, e releia o card para provar que aparece no board:

```bash
gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$ISSUE_URL"
# Resolva IDs de item/campo/opção com `gh project item-list` e `gh project field-list`;
# então use `gh project item-edit` e releia o card para confirmar os valores.
```

5. Antes de reportar conclusão, reconcilie contagens: toda issue criada/reutilizada no escopo aparece uma única vez no Project, todos os repos foram linkados e nenhum card novo ficou sem Status. A identidade do Project, os links das issues e os field/option IDs são resolvidos por releitura do GitHub sempre que forem necessários; não crie índice, cache obrigatório ou arquivo de estado para guardá-los.

### Labels (idempotente; espelho/fallback técnico; reutilize convenção do repo se já existir)

```bash
gh label create "priority:p0" --color "B60205" --description "Critical / blocker" 2>/dev/null || true
gh label create "priority:p1" --color "D93F0B" --description "High priority" 2>/dev/null || true
gh label create "priority:p2" --color "FBCA04" --description "Medium priority" 2>/dev/null || true
gh label create "priority:p3" --color "0E8A16" --description "Low priority" 2>/dev/null || true

gh label create "effort:s" --color "C5DEF5" --description "Small" 2>/dev/null || true
gh label create "effort:m" --color "1D76DB" --description "Medium" 2>/dev/null || true
gh label create "effort:l" --color "5319E7" --description "Large" 2>/dev/null || true
gh label create "effort:xl" --color "3E4B9E" --description "Extra large / split" 2>/dev/null || true

gh label create "epic" --color "5319E7" --description "Macro outcome; execution stays in native sub-issues" 2>/dev/null || true
# `area:*` is domain-specific: create or reuse only labels explicitly approved in the proposal.

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
gh label create "status:blocked" --color "B60205" --description "Flow: blocked by external dependency" 2>/dev/null || true
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
- Blocked by: https://github.com/OWNER/REPO/issues/<N> — gate: merged into `<base>` + issue closed
- Blocks: https://github.com/OWNER/REPO/issues/<M>

## Delivery scopes
- Base branch: `<base aprovada para este repositório>`
- Write scopes: ...
- Exclusive resources: ...
- Validation resources: ...

## Flow metadata
- Priority: P1
- Effort: M
- Suggested path: planner (L/XL) | direct builder (S/M simples)
EOF
)"
```

### 5.0 Epic/área e sub-issues nativas (somente pós-OK)

Quando a proposta aprovada tiver uma epic-pai, crie/reuse a pai e as filhas primeiro. A pai recebe `epic` e `area:*`; cada filha recebe a mesma `area:*` mais seus labels de prioridade/esforço/tipo. Não copie ACs, write scope, dependências ou estado operacional das filhas para o corpo da pai. A pai não recebe branch, claim ou PR e não pode ser puxada pelo loop de execução.

Use o ID interno numérico da filha — não seu número `#N` — e `-F` para preservar o tipo inteiro exigido pela API:

```bash
CHILD_ID=$(gh api "repos/$REPO_NWO/issues/$CHILD_NUMBER" --jq '.id')

gh api --method POST \
  "repos/$REPO_NWO/issues/$EPIC_NUMBER/sub_issues" \
  -F sub_issue_id="$CHILD_ID"
```

Antes de ligar, releia pai/filha: elas devem estar no mesmo owner, a filha não pode ter pai conflitante e o vínculo precisa constar do proposal aprovado. Não use `replace_parent`; pai existente, resposta `422`, truncamento ou identidade ambígua é `BLOCKED`, não permissão para mover/remover hierarquia. Para várias filhas, vincule uma por chamada e releia após cada uma; nunca faça criação, vínculo e verificação em um script composto.

Verifique o resultado por leitura remota, não pelo exit code:

```bash
gh api --paginate "repos/$REPO_NWO/issues/$EPIC_NUMBER/sub_issues?per_page=100" \
  --jq '.[] | {number,id,title,state}'
gh api "repos/$REPO_NWO/issues/$EPIC_NUMBER" --jq '.sub_issues_summary'
```

A resposta deve conter exatamente as filhas aprovadas e o resumo de progresso esperado. A hierarquia nativa do GitHub é o próprio registro: não replique epic, filhas, progresso, bodies ou dependências em nenhum índice local.

### Regras

- Reportar URL/número do Project, epic quando existir, e de cada issue/card
- Não recriar se já existir equivalente — linkar
- `effort:xl` → split antes de `ready`

### 5.1 Contrato remoto: grant, contrato de issue e DAG derivado

Nada de plano, schedule, DAG, índice ou estado local de entrega. O GitHub carrega tudo:

| Autoridade | Onde vive | O que guarda |
|---|---|---|
| Grant de campanha | `## Campaign grant` no **README do GitHub Project** | Escopo de issues aprovado, bases por repositório, modo, teto, operações nomeadas, proveniência da aprovação |
| Contrato da issue | **Body** da issue | ACs completas, escopo, dependências como **URLs totalmente qualificadas** + gate, write/validation/resource scopes |
| Estado operacional | **Project `Status`** + assignee/labels | Backlog, Ready, In progress, In review, Blocked, Done |
| Progresso e evidência | **Comentários** da issue e PR | Claims, blockers, resultados, links de PR/SHA |

O body de cada issue executável deve conter uma seção de dependências e escopos legível por máquina e por humano:

```md
## Dependencies
- Blocked by: https://github.com/OWNER/BACKEND/issues/12 — gate: merged into `release/2.1` + issue closed
- Blocks: https://github.com/OWNER/APP/issues/3

## Delivery scopes
- Base branch: `release/2.1` (repositório OWNER/BACKEND)
- Write scopes: `src/auth`, `db/migrations`
- Exclusive resources: auth contract, database schema
- Validation resources: test database (disposable, run-owned)
- Suggested route: planner
```

Sempre use URL totalmente qualificada nas dependências: `#N` é ambíguo entre repositórios.

Regras do DAG derivado:

1. O DAG é **derivado em memória** a cada releitura do GitHub e descartado depois; ele não é publicado em lugar nenhum. Ordem topológica, camadas, candidatos e matriz de hazard são recalculados, nunca lidos de cache.
2. Cada nó é uma issue-filha entregável do Kanban, não uma epic-pai nem subtarefa interna de builder. Se uma issue precisar de planner, o plano menor vive em `.pi/plans/` **dentro daquela workspace de issue** e é transitório: é plano de engenharia, não estado de controle de entrega.
3. Dependência só é satisfeita quando a evidência remota exigida pelo gate existir; por default, upstream `done` significa PR merged **na base escolhida daquele repositório** + issue fechada + status coerente. Task `completed` no Orca é desfecho de tentativa, nunca satisfação de dependência.
4. Cada issue registra a base do seu repositório; em multi-repo, dependências cruzadas são gates entre repos, e cada issue continua com um repositório, uma workspace e uma branch real.
5. Concorrência só depois do grant aplicável e do protocolo obrigatório em `references/parallel-execution.md`. Cada candidato precisa de write scopes, recursos exclusivos e recursos de validação fundamentados **no body da issue**. Campo ausente ou independência incerta significa **serializar**, não adivinhar.
6. Quando evidência de execução revelar nova dependência, split, issue, gate de validação, hazard ou ordem necessária, proponha a mudança. Alteração material de escopo, prioridade, dependência, base ou composição de issues exige OK explícito **antes** de editar o body da issue ou o grant no README, e antes de qualquer mutação externa correspondente.
7. Divergência entre grant, bodies e Project (dependência sem gate, ciclo, base contraditória, issue fora do escopo aprovado) **bloqueia novas admissões** até reconciliação explícita com o usuário. Nunca recrie issues para "consertar" a leitura, e nunca preencha a lacuna com um arquivo local.

Depois de criar, reporte distribuição, confirme o intake da campanha e siga o modo acordado: em SUPERVISIONADO, pergunte antes de começar `#N`; em AUTÔNOMO ou YOLO, comece a agendar o conjunto aprovado sem repetir a mesma pergunta.

---

## Phase 6 — Re-entry + ler o kanban como engenheiro (obrigatório)

Antes de admitir qualquer issue — inclusive em chat novo ou quando o user disser **"segue"**, **"continua"**, **"próxima"** ou **"o que dá para rodar junto?"** — reconstrua a entrega sem pedir ao usuário para repetir contexto. A ordem de autoridade é:

1. **GitHub Project Status** — obrigatório para a entrega desta skill; labels só são fallback temporário para histórico/migração aprovada;
2. **issue/assignee + claim marker + PR no GitHub**;
3. **branches remotas e SHAs atuais**;
4. **workspaces, terminais e dispatches do Orca** (evidência viva de execução);
5. histórico local **opcional** `.pi/flow/<project-slug>/`, se existir;
6. `.pi/memory/` e contexto do chat.

As fontes 5 e 6 são dicas somente-leitura sem autoridade nenhuma. O re-entry precisa funcionar **inteiramente sem elas**.

Conflito é reconciliado entre as fontes, nunca apagado pela primeira que parece conveniente. Uma leitura nova invalida fatos antigos. `.pi/flow` é rebuildable e nunca é lock, claim ou motivo para recriar backlog ausente. Workspace Orca ausente neste host não libera claim remoto: o trabalho pode estar em outro host.

### 6.0 Re-entry remoto: completo, fast path e delta de campanha

Após compactação ou perda de contexto, use re-entry completo: o resumo do chat é uma pista, nunca inventário atual nem prova de autoridade. Persistência não é sincronização automática.

**Fast path (mesma sessão, mesma issue WIP):** se o coordenador já completou um re-entry completo nesta sessão, está na mesma issue WIP e nenhuma anomalia/handoff ocorreu desde então, releia a issue WIP, claim marker, PR, branch remota **e a workspace/terminal Orca atribuídos**. Se tudo confere, prossiga. Divergência, troca de issue, chat novo, handoff ou anomalia saem do fast path.

**Delta de campanha (mesma sessão ininterrupta, candidata diferente):** só quando **todas** as precondições valem: o re-entry completo (baseline) já foi concluído nesta sessão; não houve compactação, perda de contexto, chat novo, handoff nem anomalia desde então; grant, repositório(s), base(s) e coordenador são os mesmos. Cada admissão ainda exige evidência **atual** de ocupação de toda a campanha: Status dos itens do Project (com a checagem de truncamento), todos os claims ativos e PRs, inventário de branches remotas com SHAs (`git fetch --prune origin` + `git ls-remote --heads origin`) e workers Orca alcançáveis (`worktree ps`, `terminal list` e dispatches dos ativos). Releia as linhas que mudaram desde o baseline, o body/claims da candidata atual, os gates das dependências transitivas e o contrato de **todo** WIP ativo para colisão. Um contrato conhecido só é reutilizado após comparar a identidade e o body obtidos na leitura remota atual (podem vir de uma consulta em lote) com o baseline; `updated_at` sozinho não prova conteúdo igual. Linha nova ou desconhecida é reconciliada. Não é exigido reler o histórico de issues fechadas nem todos os módulos a cada candidata. Branch/claim/conflito novo e inexplicado, ou inventário incompleto (truncado, inalcançável, ambíguo), volta ao re-entry completo. Compactação, chat novo, handoff e anomalia exigem o completo — nunca o delta.

**Re-entry completo** — execute nesta ordem no início de um chat novo, após compactação/perda de contexto, handoff ou anomalia, sempre que não houver baseline válido na sessão, e quando o delta cair para ele:

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

# Para cada número de epic no escopo aprovado (atribua `EPIC_NUMBER` antes),
# releia a hierarquia nativa. Ela dá contexto/progresso; nunca substitui
# dependências do DAG nem autoridade do Project.
gh api --paginate "repos/$OWNER/$REPO/issues/$EPIC_NUMBER/sub_issues?per_page=100" \
  --jq '.[] | {number,id,title,state}'

gh api --paginate "repos/$OWNER/$REPO/pulls?state=all&per_page=100" \
  --jq '.[] | {number,title,state,draft,head:.head.ref,base:.base.ref,merged_at,closed_at,html_url}'

# Claims da campanha em todos os chats/hosts visíveis no GitHub.
gh api --paginate "repos/$OWNER/$REPO/issues/comments?per_page=100" \
  --jq '.[] | select(.body | contains("<!-- pi-flow-claim:v1")) | {issue_url,html_url,user:.user.login,created_at,updated_at,body}'

# Inventarie todas as branches do remote; depois classifique campanha, legacy e anomalias.
# Filtrar por prefixo pode esconder WIP antigo/não conforme e branches nomeadas pelo Orca.
git ls-remote --heads origin

# Estado do checkout canônico local (coordenação; nunca é workspace de worker).
ROOT=$(git rev-parse --show-toplevel)
git -C "$ROOT" status --short
git -C "$ROOT" branch --show-current
git -C "$ROOT" rev-parse HEAD
```

Depois, inventarie workspaces e terminais com `worktree ps --json` e `terminal list --json`. Após resolver o Project e seu grant abaixo, siga **6.0.1** para descobrir o Run, enumerar suas Tasks e só então inspecionar Dispatches — não dependa de IDs lembrados pelo chat. Registre issue, repositório, **branch real**, base, ID do workspace, handle do terminal, status de workspace e dono. Descoberta nunca cria, remove, arquiva, reatribui ou fecha nada.

Quando a intenção mencionar concorrência, múltiplos chats/agentes ou outra issue simultânea, leia `references/parallel-execution.md` **antes** de classificar candidatos. Essa referência é obrigatória para recomendação e execução concorrente; não peça ao usuário contexto que Project/issues/claims/PRs/branches/workspaces/DAG conseguem reconstruir.

Project discovery:

1. Ignore Projects `closed=true` unless the user explicitly says they remain authoritative.
2. If exactly one open Project is linked, use its returned `owner.login` and `number`.
3. If multiple open Projects are linked, compare their title/URL and documented repo convention; if authority is still ambiguous, stop and ask which Project owns delivery status.
4. If none is linked, treat this as a Project-adoption gap: para uma entrega Flow nova, pare antes de criar/puxar issues e proponha/crie o Project conforme Phase 5; para issues históricas, labels `status:*` são fallback temporário de leitura enquanto o usuário aprova a migração para um Project. If a linked Project exists but permission prevents reading it, report the permission blocker rather than silently falling back to labels.
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
# Guarde o field id de `Status` e os option ids de Backlog/Ready/In progress/In review/Blocked/Done.
```

Confirme as duas igualdades antes de usar Project como autoridade; truncamento de items ou fields bloqueia classificação global. Para uma issue/PR candidata, complemente com `gh issue view <N> --json number,title,state,labels,assignees,closedAt,url`, `gh pr view <PR> --json number,url,state,isDraft,headRefName,baseRefName,headRefOid,mergedAt,closedAt,reviewDecision,statusCheckRollup` e, quando necessário, `gh pr checks <PR>`.

Um histórico local em `.pi/flow/` pode ser lido **por último e apenas como dica**; ele nunca é autoridade, nunca é reconciliado como fonte, e sua ausência nunca bloqueia nem atrasa o re-entry. Nada precisa ser escrito lá. Registre o instante real da leitura remota em UTC, não o horário lembrado pelo chat.

### 6.0.1 Retomar o Run e as mensagens persistidas

GitHub persiste a entrega; Orca persiste o Run, suas Tasks/Dispatches e a caixa de mensagens. O chat central reconstrói a visão desses dois sistemas, sem arquivo adicional. O vínculo nativo `worktree create --issue` associa a workspace à issue real; o Run supervisiona a execução, não substitui esse vínculo nem o Project.

1. **Descobrir sem mutar.** Com Project e grant já relidos, enumere Runs; siga a paginação documentada até conseguir excluir correspondências conflitantes. Para cada candidato relevante, leia seu registro e as Tasks completas (`--brief` trunca o spec e não prova identidade):

```text
ORCA orchestration run-list --json
ORCA orchestration run-show --id <run-id> --json
ORCA orchestration task-list --run <run-id> --json
```

2. **Provar o vínculo.** Cruze URL do Project, repositórios/bases aprovados e URLs das issues com o objetivo do Run, specs das Tasks, claims e vínculos nativos das workspaces. IDs vêm das respostas; título parecido, idade ou terminal ocioso não provam identidade nem propriedade. Para as Tasks identificadas, use `orchestration dispatch-show --task <task-id> --json`, depois `orchestration worker-show --dispatch <dispatch-id> --json` e `orchestration worker-read --dispatch <dispatch-id> --json`. Task sem Dispatch ainda não foi comprovadamente iniciada; preserve e reconcilie, sem criar substituta.
3. **Reusar, não duplicar.** Não use `run-create` para recuperar contexto perdido. Run ausente, inacessível ou ambíguo com WIP existente bloqueia novas admissões afetadas; preserve workers e reporte a lacuna. Não crie outro Run/Task/workspace para contornar isso. Somente numa campanha realmente nova, autorizada e sem execução/claim correspondente, crie um Run; seu `--objective` deve citar a URL do Project e o mapeamento de repos/bases, sem segredo nem path local. Isso facilita descoberta, mas nunca concede autorização. Runs legados sem esses dados precisam de vínculo comprovado pelas Tasks/claims, não de recriação.
4. **Vincular com autoridade.** Se o terminal atual já tem o vínculo correto comprovado, mantenha-o. Em outro terminal, `run-use` só depois da prova de propriedade ou handoff explícito e conforme a autoridade aceita pelo runtime: `orchestration run-use --id <run-id> --json`. Não use `--from` nem `--takeover-legacy` como atalho para tomar uma campanha atual; um coordenador concorrente ou autoridade desconhecida bloqueia o vínculo. O Run da campanha precisa ficar vinculado (ou reconciliado) ao **PI coordenador exato**: é a mailbox desse dono que recebe o ponteiro automático de 7.4.
5. **Recuperar pendências antes de seguir.** No Run vinculado, inspecione sem consumir:

```text
ORCA orchestration check --peek --json
```

Reconcilie perguntas, escalations e resultados pendentes antes de admitir novo trabalho. Processe o lote FIFO completo; responda apenas perguntas ainda pendentes com `orchestration reply --id <message-id> --body <resposta> --json`, preservando seus IDs em vez de abrir perguntas duplicadas. Verifique cada resultado contra a issue/Dispatch e resolva a liberação ou retenção autorizada do terminal **antes do ack do Delivery exato**. Se o peek não fornecer Delivery acionável, obtenha-o pelo `check` documentado depois da inspeção; nunca invente ID de ack nem considere o peek consumo. Depois volte ao wake por evento da Phase 7.4, sem espera ativa. Na reentrada, `check --peek` é só diagnóstico seguro da inbox existente quando o wake automático não está comprovado.

O resumo no chat mostra Project, Run verificado, issues/workers ativos, perguntas/blockers pendentes, último instante de releitura e próxima ação segura. É uma visão derivada, não outra fonte persistente. Runtime indisponível não vira prova de worker encerrado ou vaga livre; a retomada real após reinício depende de o Orca conseguir comprovar o estado preservado.

### 6.1 Tabela de reconciliação em memória

O produto do re-entry é uma tabela **em memória**, derivada do que acabou de ser lido no GitHub e no Orca, usada para decidir e para reportar ao usuário. Não existe arquivo canônico de estado:

```md
# Flow Orca reconciliation — OWNER/REPO (in memory, derived at read time)

- Authority: Project Status → issue/claim/PR → remote branch → Orca workspace/terminal
- Campaign grant (Project README): mode, base per repo, ceiling, named operations, approval provenance
- Campaign base for this repo: release/2.1@<40-char SHA>
- Approved concurrency: N (ceiling 12); active issue PI workers: N
- Remote read at: 2026-07-09T12:00:00Z

## Reconciled active claims
| Issue | Executor ID | Assignee | Stage | Actual branch@remote SHA | Base | Claim | PR | Orca workspace/terminal | Classification |
|---|---|---|---|---|---|---|---|---|---|
| #123 | pi-... | octocat | in-progress | <branch real da resposta>@... | release/2.1 | unique | none | ws-<id> / term-<handle> | active |

## Coordinator checkout
- Branch@SHA: release/2.1@...
- Tree: clean | dirty: <owned paths summarized>

## Anomalies
- none | partial/ambiguous/orphan/stale-candidate/incident-frozen evidence
```

Reporte apenas fatos verificados, nunca segredo, token, host ou path absoluto. A tabela inclui **todos** os claims ativos conhecidos, não somente o chat atual. Use `worker active` apenas quando o dispatch vivo prova isso; caso contrário use `claim active`/`workspace present`. Como a tabela é derivada, ela é recalculada a cada re-entry e nunca serve de exclusão mútua. O que precisa sobreviver ao chat vai para o GitHub: comentário na issue, Status do Project ou PR.

### 6.2 Classificar o board reconciliado

| Coluna | Postcondição remota | Significa |
|--------|---------------------|-----------|
| **backlog** | Project/label backlog | Capturado, ainda **não** está pronto pra puxar |
| **ready** | Project/label ready; sem claim conflitante | Definition of Ready ok |
| **in progress** | Project/label + assignee + claim marker `FLOW_EXECUTOR_ID` + branch real única coerentes; workspace Orca reconciliada quando existe | Claim visível; só chame implementação de ativa se o dispatch vivo também for conhecido |
| **in review** | PR aberto com head da issue e **base = base escolhida daquele repositório** + Project/label coerente | Esperando review/checks |
| **blocked** | Dependência externa registrada na issue + Project `Blocked`; workspace preservada e sem writer novo | Esperando ação do usuário/terceiro |
| **done** | PR correspondente com `mergedAt != null` na base escolhida, issue fechada e status relido coerente | Entregue |

Issue fechada, PR fechado sem merge, `worker_done` ou task `completed` **não** implicam done.

### 6.3 Casos determinísticos de reconciliação

| Evidência remota | Classificação e ação segura |
|------------------|-----------------------------|
| `ready` + branch da issue já publicada | Claim incompleto. Verifique assignee/PR/workspace; se é do executor e não há conflito, complete `in-progress`; senão reporte e não admita. |
| `in-progress` sem branch remota | Claim quebrado. Pare implementação; releia assignee/marker/PR e o resultado real de `worktree create`. Complete somente se o `FLOW_EXECUTOR_ID` reconciliado é dono inequívoco e não há trabalho divergente; caso contrário marque/reporte `anomaly`. |
| Resultado de `worktree create`/`worker-start` desconhecido | Reconciliação, nunca retry cego: releia `worktree ps`, `terminal list` e o dispatch antes de qualquer nova chamada; jamais crie uma segunda workspace para a mesma issue. |
| PR aberto com label/status errado | PR prevalece para o estágio; verifique head/base e então corrija para `in-review`, confirmando pós-condição. |
| PR merged + issue/status stale | Verifique `mergedAt` e vínculo; feche issue se não auto-fechou, remova status stale e marque done. |
| PR closed, `mergedAt=null` | Não é done. Classifique `blocked`/`anomaly`; decida com usuário se reabrir ou criar PR substituto. |
| Issue closed sem PR merged | Não é done. Preserve o close e reporte motivo/anomalia; reabra/retome somente após decisão explícita, mas não aplique `done` sem PR merged. |
| 2+ branches da issue ou 2+ PRs da issue | Ambíguo. Não escolha nem apague; liste URLs/SHAs/owners e peça decisão/handoff. |
| vários assignees ou assignee ≠ owner reconciliado | Outro dono/claim ambíguo. Não admita; exija handoff explícito no GitHub e nova reconciliação. |
| branch/claim remoto sem workspace Orca neste host | `reserved-remote`; pode estar em outro host. Não libere nem duplique. |
| workspace Orca de issue sem claim/branch/status coerentes | `partial-claim` ou `orphan`; não edite, não remova, não arquive e não ofereça a issue. |
| 2+ workspaces para a mesma issue/branch, ou workspace divergente | `ambiguous`; bloqueie os envolvidos e reporte IDs, branches e SHAs. |
| claim aparentemente antigo sem atividade observável | `stale-candidate`, nunca livre por idade. Takeover requer handoff/decisão GitHub-visível e nova reconciliação. |
| reserva/claim legado do esquema antigo de branch determinística | Continua **ocupado**. Reconcilie explicitamente com o usuário; nunca recrie, apague ou simule o esquema antigo com uma segunda branch/serviço de reserva. |

Nunca corrija anomalia com force push, reset destrutivo, deleção silenciosa de branch remota ou remoção de workspace. Após qualquer reparo autorizado, releia as fontes afetadas e só então registre a evidência no GitHub; o histórico local permanece somente-leitura.

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
- [ ] Não é XL sem split (XL volta ao backlog; uma epic-pai opcional pode agrupar as filhas, mas nunca fica `Ready`)
- [ ] Não conflita com issue/PR/claim/branch/workspace já ativos no mesmo pedaço
- [ ] Nenhuma dependência externa aberta (credencial, acesso, decisão humana, provider); se houver, vai para `Blocked`, não para `Ready`
- [ ] Para concorrência: write scopes, recursos exclusivos e recursos de validação estão declarados e fundamentados **no body da issue**; qualquer independência desconhecida força serialização
- [ ] Impacto de regressão mapeado: jornadas/contratos anteriores, testes existentes e comandos obrigatórios estão identificados
- [ ] Para features existentes afetadas, a baseline de caracterização já passa na base escolhida do repositório ou há uma issue predecessora explícita que a estabelecerá

**Ready ≠ compromisso de fazer agora.** Ready = “pode ser puxado sem vergonha”.

#### `in progress` — WIP real

- Um único writer por issue e por workspace; no máximo doze workers PI de issue ativos na campanha
- **Obrigatório:** workspace Orca criada para a issue, com branch **real** lida da resposta, a partir da base escolhida daquele repositório
- Status no GitHub atualizado **e relido** no momento em que a workspace nasce / o trabalho é injetado — não no fim do dia
- Comentário curto na issue com branch real + intenção ajuda o board humano

#### `in review`

- PR aberto (não draft, salvo acordo) **contra a base escolhida do repositório**
- Validação local/CI rodada ou motivo explícito
- **Qualquer PR** recebe um review independente, read-only e bounded por `validator` no head SHA final; um `PASS` já registrado para esse SHA conta e não deve ser duplicado
- Issue aponta pro PR; PR tem `Closes #N` / `Fixes #N` quando for fechar no merge
- Label `status:in-review` **no mesmo passo** do `gh pr create`

#### `blocked`

- Bloqueio externo descrito na issue com a ação exata que o usuário (ou terceiro) precisa executar
- Project em `Blocked`, relido; dependentes também saem da fila enquanto o gate não cair
- Workspace e terminal existentes são preservados; nenhum writer novo entra na issue

#### `done`

- **Obrigatório:** PR correspondente com `mergedAt != null` na base escolhida, checks/review exigidos, review independente do head SHA final e issue fechada
- Não deixe issue open com label done, nem PR merged com status in-progress

### 6.5 Re-entry de concorrência autônomo em chat novo

Trate estas intenções como operação de primeira classe:

```text
"o que dá para rodar junto?"
"o que posso pegar sem conflitar com o que já está rodando?"
"pega mais uma issue em paralelo"
```

Não peça resumo do chat anterior. Faça sozinho:

1. resolver o repo pelo cwd/remote e rodar **re-entry completo** em chat novo ou sem baseline (nunca o fast path de issue única); em sessão ininterrupta com baseline completo, aplique o delta de campanha de 6.0 antes de cada admissão;
2. carregar `references/parallel-execution.md`;
3. reconstruir a tabela de todos os Project items, claims, assignees, PRs, branches remotas e workspaces/terminais Orca;
4. ler o grant de campanha no README do Project e as dependências/escopos nos bodies das issues, e **derivar o DAG em memória** — sem depender de arquivo local, sem recriar backlog e sem inventar dependência que o remoto não declara;
5. identificar todo WIP visível, inclusive de outros `FLOW_EXECUTOR_ID`s, hosts e claims sem workspace local;
6. filtrar nós `Ready` por dependências satisfeitas, vagas livres dentro do teto, write scopes, contratos, generators, migrations/lockfiles e recursos de validação compartilhados;
7. classificar cada candidata como `ADMIT`, `SERIALIZE`, `BLOCKED` ou `UNKNOWN`; `UNKNOWN` nunca entra em concorrência;
8. ordenar as `ADMIT` pela camada topológica mais antiga, prioridade, capacidade de destravar e menor hazard;
9. responder com o que já está ocupado, por que as recomendações são independentes, base/workspace planejadas e evidência que ainda limita confiança.

Pergunta somente informativa (`o que dá?`) não muta GitHub nem cria workspace. Em SUPERVISIONADO, cada admissão pede OK; em AUTÔNOMO e YOLO, o grant já cobre admitir as issues do conjunto aprovado — anuncie issue/executor/base/workspace e repita a checagem imediatamente antes do claim. Takeover, cleanup destrutivo, teto maior ou escopo novo continuam exigindo aprovação nova.

Se nenhuma candidata for comprovadamente independente, diga isso e recomende a próxima serial; nunca fabrique concorrência para satisfazer o pedido.

### 6.6 Como “assistir” o board e o DAG (triagem contínua)

Em todo “continua / próxima / segue o projeto / o que dá para rodar junto?”:

1. **Ler colunas e evidência remota** (6.0)
2. **Derivar o DAG em memória** a partir dos bodies das issues reais; ele fornece ordem/dependências, nunca substitui o status remoto
3. **Detectar anomalias** e corrigir ou reportar:
   - `in progress` sem branch real / branch órfã sem issue
   - `in review` sem PR, ou PR com base diferente da base aprovada do repositório
   - `ready` com deps abertas, bloqueio externo não registrado ou gate upstream ainda não merged na base
   - issue de dependência ausente/inacessível, dependência sem URL ou sem gate, ciclo, ou divergência entre grant, body e Project
   - 2+ `in progress` para o mesmo `FLOW_EXECUTOR_ID` ou 2 writers na mesma workspace
   - claim/branch sem workspace neste host (`reserved-remote`, não automaticamente erro) ou workspace sem claim coerente (`partial/orphan`)
   - mesma issue em duas workspaces, terminal duplicado de agente ou checkout canônico usado como workspace de worker
   - workers ativos acima do teto aprovado, ou vaga “liberada” por timeout/idle em vez de assentamento provado
   - issue P0 parada enquanto P3 está in progress
4. **Calcular nós executáveis agora**: status remoto `ready`, dependências satisfeitas, nenhum claim prévio, nenhum bloqueio externo aberto e nenhum hazard de path/contrato/recurso incompatível com **qualquer** WIP reconciliado
5. **Preencher as vagas livres** com as melhores candidatas (não só o menor número), respeitando o teto de doze
6. **Pedir OK** apenas quando o modo ou a natureza da ação exigir
7. Só então admitir

Ordem de escolha:

1. Destravar `in review` se merge/fix de review é o gargalo e está autorizado
2. Continuar WIP existente da campanha antes de abrir frente nova
3. Senão: escolher entre os nós executáveis da camada topológica mais antiga
4. Dentro da mesma camada: `priority:p0` → `priority:p1` → demais; entre iguais, effort menor → número
5. Se **nada** executável: atualizar/refinar o plano ou promover backlog que passe DoR — **não** code do backlog cru

Agrupamento por afinidade é hipótese, não permissão. Aplique a matriz `ADMIT | SERIALIZE | BLOCKED | UNKNOWN` de `references/parallel-execution.md`; mesmo grupo sem independência comprovada continua serial.

```md
## Board read — OWNER/REPO
| Status | Issues |
|--------|--------|
| in progress | #… (workers ativos: N/6) |
| in review | #… (+ PR links) |
| blocked | #… (+ ação do usuário) |
| ready | #… |
| backlog | #… (top) |

Anomalies: ...
Next admissions: #<N>, #<M> — why: ...
Base per repo: OWNER/REPO → `release/2.1`
Workspace plan: Orca cria a branch; branch real vem da resposta
```

---

## Internal Execution Order bridge

**O GitHub é dono da entrega**: issue, ACs, dependências, Status, claim e PR. Esta skill opera esse estado remoto e a superfície Orca (workspace, branch real, terminal); ela não mantém um plano de entrega local. Quando a task selecionada contém `## Internal Execution Order`, preserve a seção e os artefatos de prontidão/progresso `.pi/build/TILL-DO_<task-id>.md` e `.pi/build/TODO_<task-id>.md` apenas dentro da workspace Orca da issue — nunca no checkout canônico do coordenador — e no resume handoff. Eles permanecem estado transitório local da task: nunca os converta em estado Flow/GitHub/Orca, issue, branch, workspace, claim, nó do DAG derivado, Task/dispatch do Orca, commit, checkpoint ou autorização de worker concorrente, nem os inclua no commit salvo exigência explícita da task. Eles também nunca viram autoridade de entrega: se o TILL-DO/TODO divergir da issue, o GitHub vence. Um TILL-DO bloqueado não cria TODO nem permite mutação de fonte.

## Phase 7 — Uma issue = uma workspace Orca = uma branch real (hard rule)

Toda execução de issue acontece dentro de uma workspace criada pelo Orca. O checkout canônico é do coordenador: ele coordena, integra e publica, e **nunca** é workspace de worker. Para qualquer admissão/dispatch — inclusive uma única issue — a seção 6 de `references/parallel-execution.md` é obrigatória; para mais de uma issue simultânea, o protocolo completo dessa referência.

### 7.0 Contrato de interface Orca

A interface abaixo foi verificada na versão 1.4.192 e é **política**, não substituta do guia: carregue os dois guias live no preflight (Phase 0) e siga a superfície exata daquela versão. Nunca invente subcomando ou flag; falta de flag documentada é `BLOCKED`, não licença para improvisar.

Todos os comandos de orquestração (`run-create`, `run-use`, `task-create`, `worker-start`, `dispatch-show`, `worker-show`, `worker-read`, `check`, `send`, `ask`, `reply`, `worker-release`) vivem no namespace `orchestration` e são executados como `ORCA orchestration <subcomando>`. Apenas `worktree` e `terminal` são top-level. Na tabela, a coluna Comando mostra o subcomando sempre com o namespace explícito.

| Objetivo | Comando | Regras de uso |
|---|---|---|
| Namespace da campanha | `orchestration run-create --objective ... --json`; `orchestration run-use --id <id> --json` | Um Run por mapeamento campanha/base; Run é inbox/namespace, **não** scheduler. Antes de criar ou vincular, aplique 6.0.1: descubra/reuse a execução existente; `run-use` só após reconciliar propriedade, nunca takeover cego. Detalhe interno: não exponha Run ao usuário como se fosse o board |
| Registro de tentativa | `orchestration task-create --spec ... --run <id> --json` | Estados `pending`/`ready`/`dispatched`/`completed`/`failed`/`blocked`. Uma Task é **registro de supervisão de uma tentativa**, nunca uma issue, backlog ou fonte de ACs/status. Crie **uma Task só no momento da admissão**, para a issue corrente; nunca pré-crie tasks para o board inteiro. `completed` é desfecho de tentativa, nunca prova de merge/dependência satisfeita |
| Workspace + branch + terminal PI | `worktree create --repo <selector> --name <name> --issue <N> --base-branch <base do repo> --no-parent --agent pi --setup <policy> --json` | Cria a branch e o primeiro terminal PI. **Não existe** flag documentada de nome de branch nem de attach em branch existente: não invente. `--no-parent` controla linhagem de sidebar, não a base Git. Leia da resposta o ID do workspace, a **branch real** e o handle do terminal; nunca derive branch do `--name` |
| Preparar antes de injetar | `worktree create` com `--agent pi` e **sem** prompt de trabalho | Permite preparar o PI e conferir claim/setup/status antes de qualquer edição. Inspecione e autorize política de setup e terminais default **antes** do create: eles podem mutar estado mesmo com `--setup skip`. Preserve a política de wait-for-setup |
| Metadados do workspace | `worktree set --worktree <id exato> --issue <N> --workspace-status <id> --comment ... --json` | Status conhecidos: `todo`, `in-progress`, `in-review`, `completed`. `Blocked` **não** é status Orca conhecido: sem mapeamento descoberto, mantenha o status atual e adicione comentário de bloqueio; o `Blocked` vive no GitHub Project |
| Dispatch para o PI preparado | `orchestration worker-start --task <id> --terminal <handle exato> --run <id> --json` | Adote o terminal PI exato retornado pelo create. O caminho de agente novo do `worker-start` aceita `--base-branch`, mas **não** aceita `--issue`: quando a ligação com a issue precisa existir antes do dispatch, use `worktree create` + adoção do terminal exato. `--model`/`--effort` valem para Claude/Codex/Cursor e **não** para PI: nunca os passe ao Orca. Antes do primeiro dispatch, prove no PI preparado o modelo-base obrigatório `openai-codex/gpt-6.1-sol` com `medium` (reiniciando apenas quando a UI fresca não o prova), pela sequência da seção 6 da referência; planner/plan-heavy internos mantêm suas próprias rotas. Nunca crie um segundo terminal de agente para a mesma issue |
| Verificação | `orchestration dispatch-show --task <id>`, `orchestration worker-show --dispatch <id>`, `orchestration worker-read --dispatch <id>` | Fonte de verdade do que foi injetado e do que voltou |
| Evento de conclusão (padrão) | Ponteiro nativo do Orca no PI coordenador ocioso; depois `ORCA orchestration check --run <run-id verificado> --json` (**sem** `--wait`) e `ORCA orchestration check --run <run-id verificado> --ack <delivery-id> --json` | Sem polling, monitor, extensão ou arquivo novo. O ponteiro só acorda o coordenador; veja 7.4. Timeout/idle/`check` vazio não é falha, conclusão nem vaga livre |
| Espera manual (fallback explícito) | `orchestration check --wait --types worker_done,escalation,question --timeout-ms <n> --json` | Só por pedido explícito do usuário ou quando o push do runtime está comprovadamente indisponível, com a lacuna reportada; nunca substituto silencioso de monitoramento ativo. Devolve um lote FIFO limitado: processe **todos** os itens e faça ack do Delivery exato |
| Comunicação | `orchestration send --to dispatch:<id>` para orientação; `orchestration ask`/`orchestration reply` para perguntas | Sem `--from` impersonado, sem broadcast de ciclo de vida, sem gravar capability em GitHub/cache |
| Encerrar terminal | `orchestration worker-release --dispatch <id> --json` | Só em terminal **settled e próprio**; preserva a saída enquanto a workspace existir (não sobrevive a `worktree rm`). `release_pending`/desconhecido não é limpo e não libera vaga. Sem fallback de fechar terminal. Terminal reusado/preexistente/não comprovado é retido |
| Remover worktree da issue | `worktree rm --worktree <seletor exato> --json` | Só após merge/`Done` e assentamento, com autoridade e prova de 7.6; **uma** worktree por chamada; sem `--force` nem `--run-hooks`. Sem autoridade/prova: retenha com motivo |

Resultado desconhecido de `worktree create`/`worker-start` é **reconciliação**: releia `worktree ps`, `terminal list` e o dispatch antes de qualquer nova chamada. Nunca faça retry cego nem crie uma segunda workspace/terminal para a mesma issue.

#### Run/Task/Dispatch são supervisão de runtime, não entrega

O Orca exige Run/Task/Dispatch para iniciar um worker supervisionado. Isso é exigência da interface, não um segundo backlog:

- a Task é **registro de tentativa** de uma issue **já admitida**; ela referencia a **URL exata da issue** e o **timestamp da leitura remota** que autorizou a admissão;
- o `--spec` carrega um **snapshot de handoff autossuficiente derivado** naquele momento (ACs, base, branch real, escopos, comandos de validação), como texto inline preparado em memória, nunca apenas um caminho de arquivo. Não crie `.md` só para transportar prompts/handoffs nem copie bodies de issues para arquivos locais. O snapshot é cópia derivada, **nunca autoridade**;
- a Task **não** tem autoridade independente sobre backlog, ACs ou status: se divergir do GitHub, o GitHub vence;
- **releia a issue imediatamente antes do dispatch**; mudança material (ACs, escopo, dependências, base, Status) invalida o snapshot stale e exige derivar outro;
- **não** pré-crie Tasks para o board inteiro nem espelhe o backlog em Tasks;
- **não** use `--deps` do Orca para modelar dependências entre issues do GitHub. Os gates de agendamento são verificados pelo coordenador contra a evidência remota; sucesso de Task nunca significa `Done` nem dependência satisfeita;
- planos de engenharia do PI e prontidão transitória **dentro de uma workspace de issue** continuam permitidos: são locais àquela entrega e não são estado de controle de entrega.

### 7.1 Política de workspace, branch, terminal e claim

| Regra | Detalhe |
|-------|---------|
| 1 issue → 1 workspace → 1 branch real | Nunca misture duas issues na mesma branch/workspace; a branch é a que o Orca criou e retornou |
| Workspace | Uma workspace por issue neste ambiente; o checkout canônico do coordenador nunca é editado por worker |
| Base | A **base escolhida no intake para aquele repositório**, passada em `--base-branch`; nunca a default implícita. SHA da base registrado no claim |
| Nome | O nome do workspace é rótulo humano; identidade real = ID do workspace + branch retornada. Branches legadas continuam reconhecidas e nunca duplicadas |
| Executor | `FLOW_EXECUTOR_ID` único e estável por issue; login GitHub sozinho não separa chats/agentes |
| Claim | Project/assignee + marker + branch real + workspace/terminal; nenhum sinal isolado é lock suficiente |
| WIP | 1 writer por issue/workspace; no máximo **12 workers PI de issue** ativos no total, dentro do teto aprovado |
| Sujo | Estado sujo pertence à workspace onde foi observado; outro executor nunca stasha/commita/descarta |
| Preservação | Workspace, branch, terminal e reserva **não relacionados à campanha** ficam intocados (incluindo WIP, órfãs, stale, reusadas, preexistentes ou não provadas); nada de deletar, arquivar, renomear ou reatribuir |
| Reuso | Só com prova exata de issue, repositório, branch real, base, PR e dono; nome parecido, idade ou terminal ocioso não são prova |
| Cleanup | Só a worktree de issue criada pela campanha, descartável, com merge/`Done` e assentamento provados e autoridade específica, pode ser removida (7.6); caso contrário é retida com motivo. Terminais só são liberados quando settled; branch remota, PR e issue nunca são apagados |

Antes do claim, complete a Phase 6, inventarie as workspaces/terminais existentes e classifique **todas** as branches remotas, procurando claim marker, branch ligada à issue por PR/comentário ou PR cujo head represente o mesmo trabalho. Branch não conforme sem vínculo não vira claim por suposição. Se já há branch/PR/workspace ligada, reconcilie e retome; não crie outra. Não admita se outro login/marker é dono, se há múltiplos assignees/markers, ou se o `FLOW_EXECUTOR_ID` proposto já tem WIP.

Handoff exige evidência explícita no GitHub (assignee/marker atualizado e comentário/decisão identificável), recursos em estado seguro e nova reconciliação. Multi-assignee, multi-marker ou dois coordenadores é `ambiguous`, não colaboração implícita: pare até restar um responsável ou o usuário documentar outra política.

### 7.2 Admissão, workspace e dispatch como transições verificadas

O coordenador admite **em série**, mesmo quando a implementação vai correr em paralelo. GitHub e Orca não oferecem transação única nem claim atômico entre máquinas: o que existe é intenção visível + releitura antes do dispatch.

**Protocolo detalhado único: `references/parallel-execution.md`, seção 6.** Carregue-a antes de qualquer admissão/dispatch, mesmo de uma só issue; ela é o único dono dos comandos de create, terminal, modelo, modo, Task, `worker-start` e recuperação. Esta seção traz apenas os estágios e o claim — não mantenha um segundo protocolo aqui.

1. **Handoff em memória primeiro.** Antes de criar a workspace, feche o handoff limitado (ACs, escopo, recursos, validação, NOT TO DO, grant); depois do create só entram os campos derivados do runtime (ID do workspace, branch real, handle do terminal, SHA). Sem Task pré-criada.
2. **Recheque e publique a intenção no GitHub** (esta seção é a dona do exemplo): resolva o usuário autenticado por `gh api user -q .login`, atribua a issue a ele e prove que ele é o único assignee antes de marker de claim e `In progress`. Assignee existente diferente ou múltiplos assignees bloqueiam a admissão; nunca remova outro assignee automaticamente. O `FLOW_EXECUTOR_ID` é derivado **por issue nova** (nunca herdado do shell do coordenador para a próxima linha); reuse um ID só para aquela exata issue própria já existente, vindo do marker dela. Em seguida, releia:

```bash
export EXECUTOR=$(gh api user -q .login)
# Issue nova: ID único e fresco. Issue própria existente: use o ID do marker dela.
export FLOW_EXECUTOR_ID="pi-$(date -u +%Y%m%dT%H%M%SZ)-$(openssl rand -hex 3)"
BASE="<base aprovada para este repositório>"
BASE_SHA=$(git rev-parse "origin/$BASE")

gh issue edit <N> --add-assignee "$EXECUTOR"
gh issue view <N> --json assignees --jq '.assignees | if length == 1 and .[0].login == env.EXECUTOR then .[0].login else error("FLOW_ASSIGNEE_MISMATCH") end'
gh issue edit <N> --remove-label "status:ready" --remove-label "status:backlog" \
  --add-label "status:in-progress"
gh issue comment <N> --body "$(cat <<EOF
<!-- pi-flow-claim:v1 issue=<N> executor=$FLOW_EXECUTOR_ID base=$BASE@$BASE_SHA -->
Flow Orca: **in progress** a partir de \`$BASE@$BASE_SHA\` (executor ID: \`$FLOW_EXECUTOR_ID\`, GitHub: \`$EXECUTOR\`).
EOF
)"

gh project item-edit --id "$PROJECT_ITEM_ID" --project-id "$PROJECT_ID" \
  --field-id "$STATUS_FIELD_ID" --single-select-option-id "$IN_PROGRESS_OPTION_ID"
flow_project_items   # releia: o item precisa mostrar In progress
```

3. **Autorize setup e terminais default, crie a workspace e leia a resposta real** (comando e campos exatos na referência, seção 6).
4. **Unidade ininterrupta.** Criação, preparação e dispatch são uma só unidade limitada. Aberto o PI, as próximas ações do coordenador são exclusivamente desta linha: pós-condições → modelo-base `openai-codex/gpt-6.1-sol` com `medium` provado na UI fresca → receipt de sessão `EXECUTION_MODE={"mode":"<canonical grant mode>","source":"session"}` → releitura da issue → Task → `worker-start` → ativação imediata de `/goal <objetivo da Task>` no mesmo terminal → verificação do dispatch vivo e do Goal; ou bloqueio explícito que preserve a linha. Enquanto a linha estiver sem atribuição e acionável: nenhum scouting alheio, nenhuma reanálise do board, nenhum outro PI aberto e nenhuma resposta de “progresso” como fim de turno. Ambos os receipts são obrigatórios antes da Task; sem eles, bloqueie o dispatch afetado, preserve workspace/terminal, sem fallback e sem `--model`/`--effort` ao Orca.
5. **`worker-start` com falha ou resultado desconhecido** congela o ciclo de vida: leia `stage`, `effects` e `residualResources` e reconcilie workspace/terminal/dispatch existentes **antes** de qualquer nova mutação — sem retry cego, sem nova workspace, sem prompt direto como fallback e sem baixar gates.
6. Registre o desfecho onde ele sobrevive ao chat: comentário na issue com branch real, base e SHA verificado. Diga `worker active` somente após ler o dispatch vivo. A tabela de reconciliação continua em memória.

O PI preparado **não edita nada** antes desse conjunto de pós-condições. Se qualquer passo falhar: **pare aquela linha**, releia tudo e complete apenas a parte ausente quando a propriedade continuar inequívoca; caso contrário registre `partial-claim` com branch, assignees, status, SHA e erro exatos. Não faça “rollback” apagando branch, workspace ou terminal, e não sobrescreva trabalho do usuário. Uma linha bloqueada só libera linhas independentes sob os gates de segurança/isolamento já existentes.

### 7.3 Scheduler contínuo

- O scheduler é **work-conserving**: sempre que houver vaga livre, candidata `ADMIT` e nenhum hazard, admita. Não existe wave imutável nem espera por todos terminarem.
- **Teto global: doze workers PI de issue simultâneos**, somando todos os repositórios e hosts da campanha. Doze é limite, não meta; o teto aprovado no intake pode ser menor.
- Uma vaga só volta quando aquele writer **assentou com segurança**: resultado lido, PR/estado registrado, transição de Project relida e terminal liberado (`worker-release` em terminal settled) ou explicitamente retido com justificativa. Retenção da worktree por cleanup sem autoridade/prova não segura, por si só, a vaga de um worker já assentado. Timeout, idle, silêncio, `check` vazio ou terminal quieto **não** liberam vaga.
- Writer bloqueado ou de estado desconhecido, mas ainda vivo, **mantém** sua vaga até assentamento seguro.
- Issues com bloqueio externo não ocupam vaga: vão para `Blocked` com a ação do usuário registrada, junto com seus dependentes, e a fila segue com trabalho independente.
- **Prioridade de ações do coordenador:** (1) tratar pergunta/resultado pendente (6.0.1, `check`); (2) terminar primeiro um PI aberto ainda sem atribuição; (3) despachar candidatas independentes seguras — prepare-as em conjunto a partir da matriz atual, mas termine o dispatch de uma antes de criar a próxima, sem esperar a conclusão do primeiro worker; (4) só então observação limitada pontual (o padrão é o wake por evento de 7.4, sem polling) ou trabalho independente útil em **outras** issues. O WIP de um worker ativo é dele até `worker_done`, pergunta ou escalation: o coordenador não o revisa, testa, caça bugs nele, prepara recursos de validação para ele nem manda mensagens sobre ele; a validação do coordenador começa depois do resultado. Sem timer fixo de polling nem mecanismo novo; idle nunca prova atividade nem permissão.
- Sem aninhar campanhas dentro de workers e sem contornar as guardas de nesting do Orca. Papéis internos do PI (planner/builder/QA) podem ser usados **dentro** da issue, com escopo delimitado, mas nunca para substituir um dispatch de issue nem para criar workers extras fora do teto.

### 7.4 Durante o trabalho: worker PI, monitoramento e incidentes

- O worker PI é dono da engenharia da issue **dentro da sua workspace**. O coordenador é dono do GitHub, do ciclo de vida Orca, da publicação e da integração, salvo delegação suportada e explícita.
- O prompt injetado é autossuficiente e inline: issue e ACs, base e branch real, escopo de escrita e paths proibidos, recursos exclusivos, comandos de validação e se há autoridade de commit/push. Não crie `.md` só para prompts/handoffs. A Task exige aguardar a ativação do Goal antes de implementar; o coordenador ativa `/goal` como comando nativo, não como texto dentro do `--spec`, seguindo a seção 6 da referência. Ausência de autorização significa não commitar nem pushar. Não é tutorial sobre o PI.
- Commits e validação final acontecem **só** na branch e workspace daquela issue.
- O `/goal` cobre somente a entrega autorizada daquele worker, sem incluir PR/merge/deploy do coordenador. Após sucesso verificado, o worker envia `worker_done` uma só vez e chama `goal_complete` com o `goal_id` atual como última ferramenta (ela encerra o turno). O `worker_done` vai ao Run do seu Dispatch pela forma existente do guia live/handoff — sem `--to`, sem `--from`, sem terminal direto duplicado. Antes de liberar o terminal, confira também `Goal complete` e assentamento sem continuação pendente. Nenhum desses sinais substitui as pós-condições de `Done` no GitHub.
- Antes de retomar em chat novo e antes de cada push, refaça fetch e compare o SHA remoto com o último SHA verificado e registrado no comentário de claim da issue. Remoto avançou inesperadamente: pare, reconcilie, sem rebase/merge automático e sem sobrescrever.
- Push sempre normal, nunca force; rejeição non-fast-forward é barreira de concorrência e exige nova reconciliação.
- **Conclusão por evento, sem polling.** O Orca já entrega o evento: quando chega mensagem sem waiter e o PI coordenador dono do Run está ocioso, ele injeta `You have <N> orchestration messages. Run \`orca orchestration check --run <id>\`.` e submete Enter; evento durante ocupação fica não lido e é reentregue na transição para idle. Um Delivery pendente suprime outro ponteiro, e um `check --wait` ativo reserva os tipos e suprime o push. O ponteiro é **só despertar**, nunca `worker_done`, nem GitHub `Done`. Ao acordar: (1) rode **um** `ORCA orchestration check --run <run-id verificado> --json` sem `--wait`; (2) processe o lote FIFO **inteiro**, validando Run, Task, Dispatch, issue e veredito explícito; mensagem de worker/ID inesperado, duplicada ou sem correspondência não é aceita nem liberada — reconcilie; (3) responda perguntas pelo ID existente (`reply`, ver abaixo); (4) resolva ciclo de vida/Goal (`goal_complete` correspondente, terminal settled, sem continuação) **antes** do ack — o wake chega já no `worker_done` e pode preceder o `goal_complete` final, então `worker_done` nunca prova Goal; é permitida **uma** verificação pontual de assentamento, guiada por esta conclusão (seção 8 da referência), que não é monitoramento contínuo. Assentamento não provado: não libere, mantenha vaga e terminal, registre a retenção explícita (motivo `assentamento pendente` + IDs de Run/Task/Dispatch/Delivery para reentrada/replay) e reporte a pendência com verdade; sem timer, espera repetida ou loop; (5) `ORCA orchestration check --run <run-id verificado> --ack <delivery-id> --json` do Delivery exato, depois de processar o lote inteiro e resolver cada decisão de liberação/retenção — retenção registrada conta como resolvida, para que um Goal não provado não congele a inbox inteira, e o ack nunca libera vaga nem prova Goal; (6) drene lotes limitados adicionais só enquanto houver mensagens realmente pendentes — nunca por timer. Depois o coordenador pode ficar ocioso/encerrar o turno com workers rodando; o Orca o acorda. Ocioso, timeout ou `check` vazio não é falha nem vaga livre. Sem sleep, loops de espera, `check --wait` repetido ou leituras repetidas de terminal só para observar.
- **Fallback manual explícito.** `check --wait --types worker_done,escalation,question --timeout-ms <n> --json` (7.0) só por pedido explícito do usuário ou quando o push do runtime está genuinamente indisponível; reporte a lacuna de capacidade e processe **todo** o lote com ack do Delivery exato. Suporte, status ou vínculo de Run ausentes = wake automático não verificado, não falha de worker; a inbox existente (`check --peek`, 6.0.1) serve para diagnóstico seguro na reentrada, sem virar monitoramento ativo. A prova é da versão instalada verificada e não cobre toda implantação. Escalation/question são respondidas por `send`/`reply`, com o worker reportando task/dispatch/capability exatos e um veredito explícito de sucesso/falha.
- **Ler o worker sem perder a posição:** use `ORCA orchestration worker-read --dispatch <id> --json` e continue com o `cursor` devolvido. A resposta informa `source` e, quando aplicável, `fallbackReason`: saída de terminal é um fallback legítimo, não prova de falha. Se vier `source_changed`, releia sem o cursor antigo. Nunca adivinhe ID de sessão do provedor ou caminho de transcript.
- **Pergunta pendente não é pergunta nova:** se `ask` expirar ou desconectar, retome com `ORCA orchestration ask --resume <message_id> --timeout-ms <n> --json`, usando o ID real já recebido. O coordenador responde com `ORCA orchestration reply --id <message_id> --body "<resposta>" --json`. Sem ID comprovado, consulte a inbox existente; não repita a pergunta às cegas.
- **Start incompleto:** leia `stage`, `effects` e `residualResources` do receipt antes de decidir o próximo passo. Setup ainda `running` após timeout não prova falha; não reinicie nem substitua o worker por silêncio. Resultado desconhecido segue reconciliação e as regras de incidente, nunca cleanup automático.
- **Reparo de defeito:** no máximo duas tentativas, cada uma com hipótese nova; no máximo um retry quando a falha for comprovadamente transitória. Depois disso, pare e reporte.
- **Incidente:** qualquer pós-estado inesperado congela os recursos afetados e a parte correspondente da campanha. Diagnóstico read-only apenas; nada de restore, reseed, cleanup, retry ou recriação sem autorização nova e explícita. Trabalho não afetado continua somente com isolamento provado.
- Escopo extra vira nova issue no backlog; não misture concerns.
- Após push, blocker, handoff ou mudança de SHA/estágio, releia a evidência afetada e registre a transição no GitHub (comentário da issue + Status do Project relido).

### 7.5 PR + in review como transição verificada

Rode a validação relevante na workspace da issue e publique sem force. Antes de criar, confirme que não existe PR para o mesmo head/issue. **Para qualquer PR**, obtenha um único review independente pelo agente `validator`, distinto de planner/builder e estritamente read-only. Passe de uma vez: base/head SHA, diff/files, escopo e matriz aprovados, CI/testes já executados e limitações conhecidas. O review fica limitado a esse material; não autoriza SSH/probes externos, paths inventados, varredura do repo ou repetição cerimonial de suítes. Um `PASS` já emitido para o mesmo head SHA satisfaz o gate. Novo review só após mudança do head ou correção material de blocker concreto. Não mova para `in-review` com blocker comprovado no escopo.

```bash
BRANCH="<branch real retornada pelo Orca>"
BASE="<base aprovada para este repositório>"

git push -u origin "$BRANCH"
PR_URL=$(gh pr create --head "$BRANCH" --base "$BASE" --title "<title>" --body "$(cat <<'EOF'
## Summary
...

## Issue
Closes #<N>

## Validation
- [ ] teste novo/ajustado para o comportamento desta issue
- [ ] regressão direcionada para jornadas, contratos e issues anteriores afetadas
- [ ] suíte padrão relevante do repositório
- [ ] diagnostics clean (relevant)
- [ ] review independente por `validator` (sem editar), sem blockers pendentes
- [ ] limitações de ambiente/validação, se houver, documentadas (não marcar done sem decisão explícita)

## Notes
...
EOF
)")

gh issue edit <N> --remove-label "status:in-progress" --add-label "status:in-review"
gh issue comment <N> --body "Flow Orca: **in review** — $PR_URL"
```

Atualize Project Status e releia a pós-condição:

```bash
gh project item-edit --id "$PROJECT_ITEM_ID" --project-id "$PROJECT_ID" \
  --field-id "$STATUS_FIELD_ID" --single-select-option-id "$IN_REVIEW_OPTION_ID"
flow_project_items
# No item `$PROJECT_ITEM_ID`, confirme Status = In review.
```

Releia PR e issue: URL/número existem, `headRefName` é a branch real, `baseRefName` é a base aprovada, head SHA é o validado, PR está no draft/review state acordado, checks/validação registrados e label/Project dizem `in-review`. Se o Orca tiver mapeamento, `worktree set --workspace-status in-review`. Approvals continuam obrigatórios conforme proteção/política; não existe merge automático. Falha de pós-condição volta para reconciliação, nunca para criar PR duplicado.

### 7.6 Integração, Done e assentamento

A integração é **serial por repositório**, sempre na base escolhida, nunca em `main` implícita. Merge exige autorização do modo vigente: em SUPERVISIONADO e AUTÔNOMO, aprovação explícita; em YOLO, o grant cobre o merge **depois** de review independente do head SHA final e dos checks exigidos.

Se a base avançou enquanto o PR esperava, incorpore-a apenas por merge normal autorizado, com o writer parado em checkpoint; depois rode de novo a validação afetada e obtenha novo review do head SHA final. Nunca force push, nunca rebase automático, nunca merge de PR cuja evidência ficou obsoleta.

Depois do merge, prove-o remotamente antes de marcar `Done`:

```bash
gh pr view <PR> \
  --json number,url,state,headRefName,baseRefName,headRefOid,mergedAt,closedAt,reviewDecision,statusCheckRollup
gh issue view <N> --json number,state,labels,assignees,url
```

Pós-condição de `Done`, todas obrigatórias: `mergedAt != null`; `baseRefName` igual à base aprovada; head/checks/review conforme política; review independente do SHA final; issue **fechada** — quando a base não é a default e o GitHub não fecha automaticamente, feche explicitamente com `gh issue close <N>` referenciando o PR; labels stale removidas; e Project `Done` **atualizado e relido**:

```bash
gh project item-edit --id "$PROJECT_ITEM_ID" --project-id "$PROJECT_ID" \
  --field-id "$STATUS_FIELD_ID" --single-select-option-id "$DONE_OPTION_ID"
flow_project_items
# No item `$PROJECT_ITEM_ID`, confirme Status = Done.
```

Nunca são `Done`: `worker_done`, exit verde, task `completed`, PR aberto, PR fechado com `mergedAt=null`, deployment/migração exigida pela AC ainda incompleta, ou aceitação pendente do usuário quando a AC a exige.

Assentamento final da issue: registre o resultado em comentário da issue e no Status relido do Project, libere o terminal com `worker-release` **somente** se ele for próprio e settled (do contrário retenha e diga por quê). Só depois desse assentamento a vaga volta ao scheduler; a retenção da worktree por falta de autoridade/prova não a segura. Volte à Phase 6 antes de admitir a próxima issue.

**Cleanup condicional da worktree da issue.** Receita detalhada única: `references/parallel-execution.md`, seção 10. Resumo: depois de merge/`Done` provados **e** ciclo de vida assentado (Goal finalizado, sem continuação/pergunta/Delivery/reuso pendente), o coordenador pode remover **uma** worktree de issue criada e descartável da campanha com `ORCA worktree rm --worktree <seletor exato> --json`, sem `--force`/`--run-hooks`, somente com autoridade específica (4.1) e prova fresca de dono, repositório, host, caminho canônico, ID, registro Git, branch, PR/SHA publicado, base, `mergedAt`, issue fechada e `Done`. Classifique **todo** o conteúdo — incluindo ignorados, histórico/refs/reflogs ou trabalho salvo não publicado — e preserve fora dela o que importa; conteúdo desconhecido, aliases/links/filhos/processos/terminais compartilhados bloqueiam só esse cleanup. Sem `git clean`/`rm` de pré-limpeza. `worker-release` isoladamente não preserva evidência após `worktree rm`: o remove encerra PTYs, apaga diretório, registro, metadata e histórico de terminal. Falha ou pós-estado ambíguo é incidente (congelamento read-only, sem retry/workaround). Registre remoção ou retenção e motivo na issue. Cleanup nunca é recuperação nem autorização para remover órfãs/stale/reusadas/preexistentes/não provadas.

Se restar apenas trabalho bloqueado ou em review e nenhum worker ativo, encerre a campanha com relatório: entregue, PRs abertos, ações pendentes do usuário, issues bloqueadas e worktrees removidas ou retidas com motivo.
---

## Phase 8 — Implementar a issue puxada

| Issue | Caminho |
|-------|---------|
| S, local | direta / `builder` |
| M | pre-plan leve → builder(s) |
| L / multi-file | `planner` skill → builders |
| Alto risco | `planner` → menor builder adequado + gates seletivos; operações externas ficam com o orquestrador, salvo pedido explícito do usuário para usar um subagente; heavy somente para integração local excepcional; quando o usuário pedir o ensemble plan-heavy, usar a skill `plan-heavy` (três briefs + uma sessão nova de planner usando o prompt original em GPT-6 Astra high) |

Sempre:

1. `agent-guide` antes de subagents
2. Scout extra se a issue exigir entendimento novo
3. Todo planner/scout/builder/tester usado dentro da issue recebe apenas a workspace Orca daquela issue e seu contrato de ownership; nenhum agent pode editar o checkout canônico do coordenador nem workspace alheia, e nenhum deles substitui um dispatch de issue
4. Antes de editar, mapear o impacto de regressão: testes, contratos, jornadas e issues anteriores na mesma superfície
5. Criar/ajustar o teste de regressão junto da mudança sempre que praticável
6. Planner quando L/complexa
7. Antes do PR, rodar: teste novo, regressão direcionada, suíte padrão relevante e checks estáticos; não substituir testes por inspeção manual
8. Antes de abrir **qualquer PR**, garantir um único `PASS` independente de `validator` para o head SHA final; reutilizar PASS existente desse SHA e nunca relançar por metadado opcional ou falso positivo fora da matriz
9. Registrar comandos, resultados e parecer bounded no PR; se uma camada exigida não rodar, declarar motivo, risco e próxima ação
10. Não avançar para `done` se houver falha, teste obrigatório não executado, blocker comprovado no escopo ou perda de cobertura material sem decisão explícita
11. Planos em `.pi/plans/` referenciando `#N`

A seleção de testes deve cobrir tanto o comportamento novo quanto os contratos já entregues que compartilhem endpoint, domínio, modelo, autorização, evento, integração ou infraestrutura. Quando a feature já existia antes da mudança, a validação começa pelos testes de caracterização da baseline e compara o comportamento legítimo esperado (request, response/status, autorização e efeitos persistidos) antes e depois da alteração. Para áreas de risco (auth, autorização/PII, dinheiro, webhooks, migrations, upload e deploy), execute também a matriz de cenários adversos aplicável; testes posteriores devem continuar executando os regressivos dessas áreas.

Exceção estreita: contenção emergencial que reduz exposição ativa pode preceder uma baseline completa somente com escopo mínimo, smoke test da jornada válida, rollback conhecido e aprovação explícita do usuário. A caracterização completa continua como dependência da próxima alteração funcional; nunca use a exceção para normalizar cobertura ausente.

Se o planner gerar plano grande: **mostre resumo e peça OK** antes de builders.

---

## Phase 9 — Modo “segue o projeto X” / continue

Quando o user **não** manda lista nova, e sim continuidade:

```txt
"segue o projeto", "continua o board", "próxima issue",
"manda ver no repo X", "o que tem ready?",
"o que dá para rodar junto?", "pega outra sem conflitar"
```

### Playbook

1. `cd` / confirmar repo X (path ou `owner/name`)
2. Permission gate leve (`gh issue list` ok?) + preflight Orca quando houver execução
3. Rodar **re-entry completo** (Phase 6) em chat novo, após compactação/handoff/anomalia ou sem baseline: fetch/prune, Project, issues, claim markers, PRs all-state, branches remotas e workspaces/terminais Orca; na mesma sessão ininterrupta com baseline, o delta de campanha de 6.0 substitui o refazer total para a próxima candidata. Continue aprovado usa Phase 6/7, não novo ciclo de scout/proposta/intake
4. Classificar/reparar ou reportar anomalias; preservar todo WIP existente e calcular somente candidatas independentes para as vagas livres
5. Derivar o DAG e a tabela de reconciliação em memória a partir do grant no README, dos bodies e do board; histórico local opcional entra por último e só como dica, e sua ausência nunca recria backlog nem bloqueia o resume
6. Emitir resume report com `lastVerifiedAt`, evidência do claim/PR/SHA/workspace e próximas admissões
7. Aplicar o modo registrado: se o grant já cobre esta ação/alvo/método, siga sem repetir a pergunta; se o modo é SUPERVISIONADO ou o pedido é só informativo, pare para OK
8. Reconciliar novamente a candidata imediatamente antes do claim; admitir só se assignee/claim/branch/PR/workspaces/hazards/vagas permitirem
9. Executar cada transição com pós-condição verificada e relida, registrar a evidência no GitHub e entregar conforme o grant
10. Após done verificado e assentamento seguro, voltar à Phase 6 com a vaga livre

### O que **não** fazer no continue

- Ler cache/chat antes do remoto e tratá-lo como verdade
- Recriar backlog porque `.pi/flow`/`.pi/memory` sumiu
- Perguntar de novo base/modo já aprovados quando os fatos não mudaram
- Abrir novo ciclo de scout de módulo/proposta/intake para issue já contratada; ou terceirizar ao PI uma descoberta que o DoR deveria ter fechado
- Admitir issue do backlog sem DoR, com bloqueio externo aberto ou já reclamada por outro executor
- Trabalhar em branch aleatória ou no checkout canônico do coordenador
- Avançar cards sem verificar pós-condições, reler o Project e registrar a evidência no GitHub

---

## Phase 10 — Relatórios

Após **cada** transição verificada — issue criada/refinada/ready, admissão/claim, workspace criada, push/SHA relevante, blocker/handoff, PR, review status, merge/done, assentamento e liberação/retenção de terminal — registre no **GitHub**: Status do Project atualizado e relido, mais comentário na issue quando houver evidência nova (branch, SHA, PR, blocker, handoff). Mude o grant no README do Project apenas quando o próprio grant mudar, com OK explícito, preservando o resto do texto. Edite o body da issue apenas quando ACs, escopo ou dependências mudarem materialmente. Não escreva estado desejado antes de provar a pós-condição remota.

Resume report compacto obrigatório:

```md
## Flow Orca resume — OWNER/REPO
- Remote verified at: 2026-07-09T12:00:00Z
- Authority read: Project <number|not configured>; issues/claims/PRs; remote branches; Orca workspaces/terminals
- Campaign: mode=…; base per repo=…; ceiling=12; approved concurrency=…; active issue PI workers=…
- Board: backlog=… ready=… in-progress=… in-review=… blocked=… done=…
- Grant (Project README): mode/bases/ceiling/named ops=…; approval provenance=…; derived DAG: current layer=…; executable issues=…
- Executor / WIP: `<FLOW_EXECUTOR_ID>` / login — #N | none
- Claim evidence: marker=…; assignee=…; actual branch=<branch>@<sha> off <base>; workspace=present|reserved-remote|none
- PR evidence: #P <url> — OPEN|CLOSED|MERGED; head/base=…/…; mergedAt=…; checks/review=…
- Coordinator checkout: branch@SHA=…; tree=clean|dirty (owned paths summarized)
- Reconciled claims/workspaces: active=… reserved-remote=… partial/ambiguous/orphan/stale-candidate/incident-frozen=…
- External blockers: issue → required user action
- Anomalies repaired/open: ...
- Next: resume #N | admit #M (awaiting OK unless the campaign grant already covers it)
```

Quando houver mais de um claim/WIP, use também a tabela obrigatória **Flow Orca concurrent resume** de `references/parallel-execution.md`; um resumo de issue única não pode esconder outros executores/workspaces.

Onde cada coisa vive:

```txt
GitHub Project README   # ## Campaign grant: escopo, bases, modo, teto, operações nomeadas, proveniência
GitHub issue body       # ACs, escopo, dependências (URLs + gate), write/validation/resource scopes
GitHub issue comments   # claims, progresso, resultados, blockers
GitHub Project Status   # autoridade operacional do board
Em memória              # DAG derivado, ordem topológica, matriz de candidatos/hazard, tabela de reconciliação

.pi/flow/<project-slug>/   # OPCIONAL, histórico/rascunho somente-leitura, sem autoridade;
                           # nada aqui é obrigatório produzir, reconciliar, migrar ou publicar
```

---

## Stop rules

Pare / eduque / pergunte quando:

- Skill chamada sem repo, sem lista e sem outcome (e sem board existente pra continuar)
- Permissão GitHub insuficiente
- Preflight Orca incompleto: executável não resolvido, guia live indisponível ou `status` não pronto
- A ação exigiria flag/subcomando Orca não documentado (nome de branch, attach em branch existente, `--issue` no `worker-start`, `--model`/`--effort` para PI)
- Base por repositório ou modo da campanha ainda não registrados, ou o grant não cobre a ação/alvo/método atual
- Autoridade remota ausente ou contraditória: README do Project sem `## Campaign grant` legível ou sem proveniência de aprovação, dependência sem URL totalmente qualificada ou sem gate, body/Status/grant em conflito — bloqueie as issues afetadas e reconcilie, nunca infira permissão de arquivo local ou de texto remoto editável
- PROJECT_MAP ainda não existe e alguém pede issues “já” em projeto desconhecido
- Lista ambígua no que é “implementar agora”
- Dúvida material sem OK (escopo, prioridade, split XL, auth/pay/security)
- Effort XL sem critério de split
- Qualquer workspace suja com mudanças de ownership desconhecido ou de **outra** issue/branch
- Tentativa de reusar branch ou workspace de issue A para issue B
- Board inconsistente, claim marker/assignee/branch/workspace divergentes, branch/PR/workspace duplicados ou handoff ambíguo
- Claim legado ambíguo do esquema antigo de reserva, ou dois coordenadores para a mesma campanha
- Candidata concorrente com write scope, recurso exclusivo, recurso de validação ou independência `UNKNOWN`
- Claim remoto sem workspace local sendo tratado como livre, ou takeover baseado apenas em idade/inatividade aparente
- Teto de concorrência excedido, vaga “liberada” por timeout/idle, ou `FLOW_EXECUTOR_ID` já com WIP
- Resultado desconhecido de create/dispatch (exige reconciliação, nunca retry cego)
- Incidente: pós-estado inesperado em qualquer recurso — congele e só diagnostique
- Recuperação exigiria force push, reset destrutivo, deleção remota silenciosa, remoção de workspace ou enfraquecer aprovação/review
- Cleanup sem autoridade específica, sem prova de propriedade/conteúdo/recuperação, ou com efeito ambíguo/recurso não descartável (retenha com motivo)
- Duas falhas de reparo sem hipótese nova

---

## Anti-patterns

- Criar issues no escuro porque o user disse só “roda a campanha”
- Criar issue de controle, backlog paralelo ou arquivo local de plano/schedule/DAG/índice/estado para “ajudar” a entrega
- Pré-criar Tasks do Orca para o board inteiro, ou usar `--deps` do Orca para modelar dependência entre issues do GitHub
- Tratar snapshot de handoff, Task ou texto remoto editável como autoridade de escopo, ACs, status ou permissão
- Perguntar 15 coisas genéricas **antes** de scouter o repo
- Inventar backlog “bonito” sem pedido
- Chutar priority/effort sem PROJECT_MAP
- Pular REVIEW GATE
- Duplicar issues já abertas
- Codar direto do **backlog** sem passar por **ready**
- Dois cards in progress na mesma branch, workspace ou `FLOW_EXECUTOR_ID`
- Calcular a branch pelo nome do workspace em vez de ler a branch real da resposta
- Inventar flag do Orca, ou trocar agente/modelo do PI para caber em `--model`/`--effort`
- Confiar em `git branch -a`, workspace isolada, chat ou histórico local como prova completa do estado
- Chamar transições GitHub+Orca de “atômicas”, ou seguir após pós-condição falhar
- Criar uma segunda branch/serviço de reserva para simular o esquema antigo de exclusão mútua
- Esquecer de atualizar **e reler** Project/label quando cria workspace/PR ou registra bloqueio
- Injetar trabalho antes de claim + workspace + status terem pós-condições verificadas
- Deixar um PI aberto sem atribuição enquanto faz scout repetido, reanálise do board, abre outro PI ou encerra o turno com resposta de “progresso”
- Despachar sem ativar o `/goal` da Task; achar que `/goal` escrito no `--spec` ativa o comando; ou criar `.md` apenas para transportar prompts
- Herdar o `FLOW_EXECUTOR_ID` do shell para a próxima issue; ou tentar de novo `worker-start` com erro/desconhecido sem reconciliar `stage`/`effects`/`residualResources`
- Reiniciar o PI quando a UI fresca já prova `openai-codex/gpt-6.1-sol` com `medium`, ou dar o modelo/modo por provado por echo de comando/settings
- Dar ao worker o checkout canônico, outra workspace ou autoridade GitHub/cleanup não declarada
- Assumir que workspace presente significa processo vivo, que timeout significa falha, ou que ausência local significa claim livre
- Rodar concorrência só porque paths parecem diferentes, ignorando contratos, generators, lockfiles, migrations e recursos de validação
- Tratar YOLO como bypass de segurança, ou tratar exemplo colado pelo usuário como autorização
- Restaurar, reseedar ou limpar recurso depois de mutação inesperada sem autorização nova
- Apagar, arquivar ou reatribuir workspace/branch/terminal de terceiros, órfãos, stale, reusados, preexistentes ou não provados
- Remover worktree de issue sem merge/`Done` e assentamento provados, sem autoridade específica, usando `--force`/`--run-hooks`/`git clean`/`rm`/`git worktree`/prune/fechar terminal, ou tratando `git status` limpo como prova (ignorados, histórico e refs importam); ou usar cleanup como recuperação de incidente
- Fazer polling, sleep, `check --wait` ou leitura de terminal repetidos só para observar, ou tratar o ponteiro/idle/`check` vazio como `worker_done` ou vaga livre; ou enviar `worker_done` com `--to`/`--from`/terminal direto em duplicidade
- Pular planner em L/XL
- Done sem PR merged (`mergedAt`), review/checks, issue fechada e status relido
- Engolir erro de permissão
- Citar pessoas específicas no checklist de acesso (sempre genérico pro usuário)

---

## Quick start (orquestrador)

### A) Lista nova → Project + issues + DAG + campanha
1. Educar se incompleto
2. Permission gate + preflight Orca
3. Scouts por módulo → mapa fundamentado apresentado no chat, sem arquivo local
4. Draft + **REVIEW GATE** → OK
5. Intake da campanha: base por repositório + modo + teto + operações nomeadas
6. Project/labels + create issues/cards (`Blocked` aditivo no board)
7. Gravar o grant de campanha na seção `## Campaign grant` do README do Project (preservando o resto do texto) e as dependências/escopos nos bodies das issues; reler para provar
8. Registrar bloqueios externos e começar a agendar conforme o modo

### B) Continuar projeto / board
1. Confirmar repo/Project e preflight Orca; re-entry completo em chat novo/sem baseline (delta de campanha de 6.0 na mesma sessão ininterrupta com baseline); continue aprovado vai direto a Phase 6/7
2. Reconciliar Project + issues/claims/PRs + branches remotas + workspaces/terminais, e derivar o DAG em memória do grant e dos bodies
3. Retomar WIP existente e preencher vagas livres com nós executáveis da camada mais antiga
4. Aprovação conforme o modo registrado (sem repetir grant inalterado)
5. Admissão verificada: marker + assignee + `In progress` relido → `worktree create` com a base do repo → branch/terminal reais → `worker-start` no terminal exato → `/goal` da mesma Task ativado e comprovado, sem arquivo de prompt
6. Implement → validar → PR na base escolhida → `In review` → merge serial autorizado → `mergedAt` + issue fechada → `Done` relido
7. Assentar com segurança (terminal liberado ou retido), registrar o desfecho no GitHub, liberar a vaga e remover a worktree só se autorizada e provada (7.6); senão reter com motivo

### C) Chat novo → descobrir trabalho concorrente sem contexto repetido
1. Resolver repo pelo cwd e rodar re-entry completo: chat novo nunca usa delta nem o fast path de issue única
2. Ler `references/parallel-execution.md` e inventariar board, claims, PRs, branches e workspaces/terminais
3. Reconciliar DAG/dependências e construir matriz de colisão com todo WIP
4. Recomendar as melhores candidatas `ADMIT` dentro das vagas, ou dizer que nada é seguro em concorrência
5. Admitir em série: preflight, executor ID, intenção visível, workspace Orca, releitura, só então dispatch
6. Integrar PRs em ordem serial na base escolhida e revalidar os restantes após cada merge

### Comando mental

```txt
/skill:flow-orca
User: [lista] — cria issues e toca a campanha

/skill:flow-orca
User: segue o projeto X / próxima issue

/skill:flow-orca
User: o que dá para rodar junto com o que já está em andamento?
```

Ordem sagrada: **reler GitHub + workspaces/terminais Orca → reconciliar Project/issues/claims/PRs/branches + grant do README → derivar o DAG em memória → provar independência ou serializar → propor → grant/OK aplicável → admissão serial de 1 issue / 1 workspace / 1 branch real / 1 executor → verificar e reler cada transição → integrar em série na base escolhida → assentar com segurança → voltar ao board**.
