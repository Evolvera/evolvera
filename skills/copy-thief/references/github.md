# GitHub Project — o painel do Copy Thief

Tudo o que foi feito, está sendo feito e falta fazer vive aqui. Escreva sempre em
pt-BR. Toda escrita é idempotente: procure antes de criar, releia depois de
alterar (exit code 0 não prova nada).

**Operações recorrentes (status, campos, labels, assignee, comentários `ct:*`,
reconciliação) vão por `scripts/ct.mjs`** — ver SKILL.md, seção "GitHub Project SEMPRE
atualizado". Os comandos `gh` crus abaixo servem para o setup único e como referência
quando o script não cobrir o caso (ex.: sub-issues, criar a issue).

Variáveis usadas abaixo: `OWNER` (org/usuário dono do Project), `REPO`
(`owner/nome`), `PN` (número do Project), `PID` (node id do Project).

## 1. Estrutura do Project

**Status** (campo nativo; opções na ordem):
`Backlog` → `Pronto` → `Em andamento` → `Em revisão` → `Bloqueado` → `Concluído`

**Campos personalizados** (poucos, de propósito):

| Campo | Tipo | Opções / uso |
|---|---|---|
| Tipo | SINGLE_SELECT | Feature, Defeito, Débito, Segurança, Teste, Docs, Pesquisa, Épico |
| Prioridade | SINGLE_SELECT | P0 (crítico), P1 (alto), P2 (médio), P3 (baixo) |
| Esforço | SINGLE_SELECT | P, M, G, GG (GG = quebrar antes de `Pronto`) |
| Risco | SINGLE_SELECT | Trivial, Lógica, Sensível, Multi-sistema (define a profundidade de teste) |
| Origem | SINGLE_SELECT | Briefing, Varredura, Achado, Humano |
| Evidência | TEXT | link do relatório de execução / PR da última entrega |

**Labels no repo** (espelho para filtro e para quem não usa o board):
`copy-thief` (toda issue gerida pelo loop), `precisa-humano` (decisão/validação
sua), `tipo:feature`, `tipo:defeito`, `tipo:debito`, `tipo:seguranca`,
`tipo:teste`, `tipo:docs`, `tipo:pesquisa`, `epico`. Reuse labels equivalentes
que o repo já tenha.

**Visões sugeridas:** Board por Status; Tabela "Defeitos" (Tipo = Defeito,
ordenada por Prioridade); Tabela "Pendências minhas" (label `precisa-humano`);
Roadmap por Épico (sub-issues).

**Automações nativas:** manter ligadas "Item closed → Concluído" e
"Pull request merged → Concluído" (renomeie o alvo para `Concluído`). Elas só
disparam depois do merge, que é gate humano — por isso o `ct:retro` é postado
**antes** de pedir o merge. Automações se configuram pela interface do Project
(Workflows); a API não cobre isso de forma confiável.

## 2. Criar/configurar (modo `iniciar`, só após OK)

```bash
gh auth status                                   # precisa de 'project' e 'repo'
gh project list --owner OWNER --format json      # reusar se já existir

PN=$(gh project create --owner OWNER --title "<Repo> — Copy Thief" --format json --jq .number)
gh project link "$PN" --owner OWNER --repo REPO
PID=$(gh project view "$PN" --owner OWNER --format json --jq .id)

for f in "Tipo:Feature,Defeito,Débito,Segurança,Teste,Docs,Pesquisa,Épico" \
         "Prioridade:P0,P1,P2,P3" "Esforço:P,M,G,GG" \
         "Risco:Trivial,Lógica,Sensível,Multi-sistema" "Origem:Briefing,Varredura,Achado,Humano"; do
  gh project field-create "$PN" --owner OWNER --name "${f%%:*}" \
     --data-type SINGLE_SELECT --single-select-options "${f#*:}"
done
gh project field-create "$PN" --owner OWNER --name "Evidência" --data-type TEXT
```

**Opções do Status:** o Project nasce com `Todo / In Progress / Done`. Troque-as
**só em Project novo e vazio** (substituir opções apaga valores existentes):

```bash
SF=$(gh project field-list "$PN" --owner OWNER --format json --jq '.fields[]|select(.name=="Status").id')
gh api graphql -f query='mutation($f:ID!){updateProjectV2Field(input:{fieldId:$f,singleSelectOptions:[
 {name:"Backlog",color:GRAY,description:"Ideias e itens ainda não prontos"},
 {name:"Pronto",color:BLUE,description:"Critérios claros, dependências ok"},
 {name:"Em andamento",color:YELLOW,description:"Reivindicada pelo loop"},
 {name:"Em revisão",color:ORANGE,description:"PR aberto, aguardando merge humano"},
 {name:"Bloqueado",color:RED,description:"Precisa de algo externo/humano"},
 {name:"Concluído",color:GREEN,description:"Aceite verificado e mergeado"}]}){projectV2Field{... on ProjectV2SingleSelectField{options{name}}}}}' -f f="$SF"
```

Se a mutação falhar nesta versão, configure as opções pela interface e siga —
é configuração única. Em Project reaproveitado com status já em uso, **não**
substitua: mapeie os nomes existentes e registre o mapeamento no contrato.

Labels (idempotente):
```bash
for l in "copy-thief:5319E7" "precisa-humano:B60205" "tipo:feature:A2EEEF" "tipo:defeito:D73A4A" \
         "tipo:debito:FEF2C0" "tipo:seguranca:B60205" "tipo:teste:0E8A16" "tipo:docs:0075CA" \
         "tipo:pesquisa:C5DEF5" "epico:3E4B9E"; do
  gh label create "${l%:*}" --repo REPO --color "${l##*:}" 2>/dev/null || true
done
```

Formulários de issue (opcional, recomendado): copie `templates/github/ISSUE_TEMPLATE/*.yml`
para `.github/ISSUE_TEMPLATE/` do repo numa issue `Docs` via PR — assim você
também abre defeitos/features no mesmo padrão.

## 3. Contrato no README do Project

```bash
gh project edit "$PN" --owner OWNER --readme "$(cat contrato.md)"   # preserve o texto existente fora da seção
gh project view "$PN" --owner OWNER --format json --jq .readme       # reler
```

```md
## Contrato Copy Thief
- Repositório.............: OWNER/REPO · base: `<branch>`
- Modo....................: AUTÔNOMO ATÉ PR | SUPERVISIONADO
- Paralelismo máximo......: 1 (até 3 com escopos disjuntos)
- Tentativas por issue....: 3
- Build / lint / testes...: `<cmd>` / `<cmd>` / `<cmd>`
- E2E.....................: `npx playwright test` · app em `<url local>` iniciada por `<cmd>`
- Recursos de estado dos testes: `<nenhum | descartável: como é criado e destruído>`
- Proibido................: merge, deploy, force push, migração em banco real, efeitos externos
- Aprovado por............: <usuário>, no chat, em <AAAA-MM-DD>
```

## 4. Modelo de corpo de issue

Título: verbo + objeto, ≤ 80 caracteres, pt-BR.

```md
## Resumo
<1–3 frases: o quê e por quê>

## Contexto
- Área/arquivos: `src/...`
- Origem: Briefing | Varredura (achado V-07) | Achado da #N | Humano
- Evidência: <trecho, comando, print, link>

## Critérios de aceite
- [ ] CA1 — <comportamento observável> → teste: `<arquivo › nome do teste>`
- [ ] CA2 — ...
- [ ] Sem regressão: `<comando da suíte>` verde
- [ ] (UI) POP `docs/pop/<fluxo>.md` atualizado

## Plano
<passos previstos, curtos>

## Testes planejados
- Fase 1 (sucesso/erro/bordas): ...
- Fase 2 (prova de fogo) — conforme Risco: ...
- E2E Playwright: `e2e/<fluxo>.spec.ts` (documentada? sim/não)

## Escopo
- Pode alterar: `...`
- Fora de escopo: ...

## Dependências
- Bloqueada por: https://github.com/OWNER/REPO/issues/<N> (concluída + mergeada)
```

**Defeito** acrescenta: `## Como reproduzir` (passos numerados), `## Esperado`,
`## Obtido`, `## Severidade`. O primeiro CA é sempre "teste que reproduz o
defeito falha antes e passa depois".

**Pesquisa** troca Plano/Testes por: `## Pergunta`, `## Decisão que apoia`,
`## Critério de encerramento` (ex.: recomendação com ≥ 2 alternativas e fontes).

**Épico**: só visão, ordem macro e fora-de-escopo; os filhos são sub-issues:
```bash
CHILD_ID=$(gh api repos/REPO/issues/<filho> --jq .id)
gh api --method POST repos/REPO/issues/<epico>/sub_issues -F sub_issue_id="$CHILD_ID"
```
Dependências: sempre a seção de texto com URL completa; use também a
dependência nativa ("blocked by") quando disponível na UI/API do repo.

## 5. Criar issue e colocar no board

```bash
URL=$(gh issue create --repo REPO --title "<título>" --label "copy-thief,tipo:defeito" --body-file corpo.md)
ITEM=$(gh project item-add "$PN" --owner OWNER --url "$URL" --format json --jq .id)
gh project field-list "$PN" --owner OWNER --format json     # ids de campos e opções (cache só nesta sessão)
gh project item-edit --id "$ITEM" --project-id "$PID" --field-id <FID> --single-select-option-id <OID>
gh project item-edit --id "$ITEM" --project-id "$PID" --field-id <FID_EVID> --text "<url>"
```
Um `item-edit` por campo. Releia com `gh project item-list "$PN" --owner OWNER --format json --limit 500`.
Preferido: um comando só, verificado e sem duplicar (idempotente por título exato):
`ct.mjs new --owner OWNER --project PN --repo REPO --title "<título>" --body-file corpo.md --label tipo:defeito Status=Backlog Tipo=Defeito Prioridade=P1 Origem=Varredura`.
Pré-requisito: as labels já existem no repo (§2). Sub-issues de épico continuam pelo `gh api` acima.

## 6. Comentários do ciclo (marcadores `ct:*`)

Cada comentário começa com o marcador HTML (para o loop achar) e é legível.

```md
<!-- ct:inicio -->
### ▶️ Início — ciclo <data hora>
- Branch: `ct/<N>-<slug>` · Executor: builder · Tentativa 1/3
- Plano: ...
- Testes que vou escrever primeiro: ...
```

```md
<!-- ct:pesquisa -->
### 🔎 Pesquisa / prior art
- Pergunta: ... · Fontes: [..](..), [..](..)
- Alternativas: A (prós/contras), B (...) · Licença: ...
- Escolha e por quê: ...
```

```md
<!-- ct:avaliacao -->
### 🧪 Avaliação independente — SHA `<sha>`
| Checagem | Resultado | Evidência |
|---|---|---|
| Suíte completa | ✅ | `npm test` 142/142 |
| CA1 | ✅ | `login.spec.ts › rejeita e-mail inválido` |
| Code review | ⚠️ | nome confuso em `x.ts:40` (não bloqueia) |
| E2E / console | ✅ | 0 erros de console |
**Veredito: APROVADO** · Risco que sobrou: ...
```

```md
<!-- ct:retro -->
### 📋 Como realmente foi (plano × realizado)
| | Planejado | Realizado |
|---|---|---|
| Escopo | ... | ... |
| Testes | ... | ... |
| Tentativas | 1 | 2 (motivo: ...) |
**Desvios e por quê:** ...
**Evidências:** PR #.. · relatório `docs/execucoes/...` · POP `docs/pop/...`
**Critérios de aceite:** CA1 ✅ CA2 ✅ regressão ✅
**Manter:** ... · **Melhorar:** ... · **Achados gerados:** #.., #..
**Risco que sobrou:** ...
```

Bloqueio: comentário `<!-- ct:bloqueio -->` dizendo exatamente o que destrava,
label `precisa-humano`, `Status = Bloqueado`. Quando você responder na issue,
o próximo `loop` relê e volta a `Pronto`.

## 7. Releitura no começo de cada sessão (re-entry)

Preferido: `ct.mjs board --owner OWNER --project PN --repo REPO --strict` (contagem por Status,
itens, PRs e divergências board × issues × PRs). Equivalente cru:

```bash
gh project list --owner OWNER --format json
gh project view "$PN" --owner OWNER --format json --jq .readme
gh project item-list "$PN" --owner OWNER --format json --limit 500 \
  --jq '.items[]|{n:.content.number,t:.content.title,s:.status,p:.prioridade}'
gh pr list --repo REPO --state open --json number,headRefName,title
```
Paginação/limite: acima de 500 itens, pagine por GraphQL. Em erro de limite de
API, espere e tente de novo (espera progressiva), sem martelar.
