---
name: project-memory
description: "Memória persistente por projeto com Markdown autoritativo para lições duráveis, arquitetura normalizada em JSON e visão HTML gerada. Auto-scan profundo com scout em paralelo, resumo contextual, busca e edição, com índice arquitetural compacto injetado automaticamente."
---

=== PROJECT-MEMORY PROTOCOL ===

## LOCALIZAÇÃO
Toda memória de projeto fica em: `{cwd}/.pi/memory/`

> **Nota**: A pasta `.pi/` na raiz do projeto é o diretório padronizado para **todos** os artefatos dos agentes:
> - `.pi/plans/` — planos persistentes (planner, designer, content-writer, polisher)
> - `.pi/build/` — checklists temporários de execução (TILL-DO.md, TODO.md)
> - `.pi/validate/` — artefatos de validação (REVIEW.md, FIX_REQUIRED.md)
> - `.pi/memory/` — memória persistente do projeto (este skill)
> - `.pi/flow/` — cache operacional rebuildable de entrega, de propriedade do skill `flow`
>
> `.pi/memory/` registra contexto e conhecimento genérico; não possui claims nem o estado de entrega do Flow. Para Flow, o estado remoto atual do GitHub sempre prevalece sobre `.pi/flow/`, `.pi/memory/` e contexto de chat. Ausência ou desatualização desses caches nunca autoriza recriar backlog, assumir issue ou sobrescrever estado remoto.

| Arquivo | Descrição |
|---------|-----------|
| `_summary.md` | Resumo humano compacto, auto-injetado e com a seção Architecture Map (ponteiro, snapshot, contagens, fluxos e gaps). Continua limitado/capado pela extension. |
| `setup.md` | Como rodar, buildar, testar, deploy. Scripts, dependências, runtime. |
| `bugs.md` | Bugs conhecidos com status [ATIVO]/[RESOLVIDO]. Workarounds e fixes. |
| `architecture.md` | Narrativa humana durável: padrão, limites, estrutura e lições arquiteturais; não duplica as tabelas normalizadas. |
| `architecture.json` | Fonte de verdade estruturada e normalizada para agentes; registros têm IDs estáveis e evidência exata relativa ao repositório. |
| `architecture.html` | Visão humana self-contained gerada de `architecture.json`; nunca editar manualmente nem usar como autoridade. |
| `env.md` | Variáveis de ambiente obrigatórias e opcionais. Secrets como [REDACTED]. |
| `api-external.md` | APIs de terceiros, rate limits, quirks. |
| `decisions.md` | Decisões técnicas. Decisão + alternativas + motivo. |

---

## REGRA 1 — INÍCIO DE SESSÃO (AUTOMÁTICO VIA EXTENSION)

A extension `project-memory.ts` injeta o conteúdo de `.pi/memory/_summary.md` automaticamente no system prompt via hook `before_agent_start`, capped, e acrescenta somente um índice compacto de `.pi/memory/architecture.json` (nunca o JSON completo).
Se a memória estiver ausente ou disser que não está inicializada → execute o SCAN INICIAL (Regra 2) IMEDIATAMENTE antes de responder qualquer coisa. JSON inválido gera aviso sem descartar o resumo Markdown; JSON ausente não significa projeto novo.

**Exceção Flow:** quando a intenção atual for continuar board/issues/PRs via skill `flow`, a Phase 6 de re-entry remoto do Flow acontece primeiro. Memória ausente não significa projeto novo quando o GitHub já contém board, issues, branches ou PRs. Só depois da reconciliação remota crie/atualize memória, se isso ainda for necessário; nunca deixe o scan de memória assumir issue, alterar kanban ou atrasar a retomada do WIP remoto.

---

## REGRA 2 — SCAN INICIAL (SCOUT EM PARALELO)

Se `.pi/memory/` não existe no projeto atual:

1. Crie o diretório: `mkdir -p .pi/memory/`
2. Copie **todos** os templates, não apenas Markdown: `cp ~/.pi/agent/skills/project-memory/templates/* .pi/memory/` (isso inclui `architecture.json` e o template `architecture.html`; o HTML será imediatamente regenerado).
3. **Lance 3 scouts EM PARALELO** (cada um com `run_in_background: true`):

**Scout A — Setup, Infra & Config:**
```
Agent(subagent_type="scout", run_in_background=true, prompt="
FAÇA UM SCAN PROFUNDO de SETUP & INFRA & CONFIG deste projeto.
- Leia package.json (ou pyproject.toml, Cargo.toml, go.mod) INTEIRO — scripts, deps, devDeps, engines
- Leia README.md INTEIRO
- Procure e leia: Makefile, docker-compose.yml, Dockerfile, .env.example, tsconfig.json, vite.config, webpack.config, tailwind.config, etc.
- Liste TODOS os comandos disponíveis (npm scripts, make targets, etc.)
- Runtime e versões obrigatórias
- Frameworks principais e versões
- Tests: framework, onde ficam, como rodar, cobertura visível
- Linting, formatting, commit hooks (eslint, prettier, husky, lint-staged)
Retorne tudo estruturado em seções com bullets detalhados.
")
```

**Scout B — Architecture & APIs:**
```
Agent(subagent_type="scout", run_in_background=true, prompt="
FAÇA UM SCAN PROFUNDO de ARCHITECTURE & APIs deste projeto.
- Mapeie estrutura de diretórios COMPLETA (pelo menos 3 níveis de profundidade)
- Identifique o padrão arquitetural (MVC, hexagonal, Clean Arch, modular, etc.)
- Para cada diretório principal, diga o que contém e a responsabilidade
- Identifique TODOS os endpoints/APIs internas (rotas, controllers, handlers) — liste cada um com método HTTP, path e o que faz
- Mapeie fluxos de dados críticos (entrada → processamento → saída)
- Identifique models/schemas/entities principais com campos chave
- Procure por diagramas mermaid ou documentação de arquitetura existente
- Middleware, interceptors, guards, pipes, etc.
- Procure por chamadas HTTP externas (axios, fetch, got, http client, SDKs) — liste TODAS as APIs de terceiros consumidas com URL base, auth, rate limits
- Procure por diagramas mermaid existentes
- Retorne também atores, hierarquia semântica L0..L3, componentes/data objects/relationships normalizados, fluxos user/data/runtime/build/deploy/failure, evidência exata repository-relative, confidence e gaps; não invente claims sem evidência
Retorne tudo estruturado em seções com bullets detalhados.
")
```

**Scout C — Env, Bugs & Decisões:**
```
Agent(subagent_type="scout", run_in_background=true, prompt="
FAÇA UM SCAN PROFUNDO de ENV, BUGS & DECISÕES TÉCNICAS deste projeto.
- Liste TODAS as variáveis de ambiente encontradas — procure em: .env.example, .env.local, config files, código que usa process.env/env(process.env)
- Identifique quais são obrigatórias vs opcionais (com defaults se houver)
- Secrets como [REDACTED]
- Procure por TODO, FIXME, HACK, XXX, BUG nos comentários — liste cada um com arquivo e linha
- Procure por try/catch vazios ou silenciosos
- Procure por código morto (exports não usados, arquivos órfãos)
- Identifique code smells evidentes
- Procure por comentários que expliquem decisões (WHY, NOTE, REASON, IMPORTANT)
- Identifique padrões de código que revelam decisões técnicas (ex: ORM escolhido, biblioteca de validação, padrão de error handling)
Retorne tudo estruturado em seções com bullets detalhados.
")
```

4. Aguarde os 3 scouts terminarem (`get_subagent_result` com `wait: true`)
5. Popule os arquivos de memória. O scout de arquitetura deve retornar atores, hierarquia semântica L0..L3, componentes/data objects/relationships normalizados, fluxos user/data/runtime/build/deploy/failure, evidência exata relativa ao repositório, confiança e gaps. Para scan grande, prefira delegar ao builder; para ajustes pequenos, o modelo principal pode editar diretamente com `write`/`edit`:
   ```
   Agent(subagent_type="builder", prompt=""
   Popule a memória do projeto em .pi/memory/ com os dados do scan:

   === DADOS DO SCOUT A (Setup & Infra) ===
   {cole aqui o resultado do Scout A}

   === DADOS DO SCOUT B (Architecture & APIs) ===
   {cole aqui o resultado do Scout B}

   === DADOS DO SCOUT C (Env, Bugs & Decisões) ===
   {cole aqui o resultado do Scout C}

   Para cada arquivo Markdown em `.pi/memory/` (setup.md, bugs.md, architecture.md, env.md, api-external.md, decisions.md):
   1. Use write para popular com os dados relevantes do scan; preserve Markdown como narrativa humana autoritativa e não duplique as tabelas normalizadas
   2. Mantenha o formato: ## Título + bullets + data
   3. Use os dados do scout B para escrever `architecture.json` com schemaVersion 1, IDs estáveis, referências sem dangling, evidência repository-relative, sourceHead/timestamps atuais, confidence e gaps explícitos
   4. Valide `architecture.json` com o script da skill e só então renderize `architecture.html`; JSON inválido bloqueia a renderização e não deve ser substituído silenciosamente
   5. Depois, leia os Markdown (exceto _summary.md), sintetize um resumo (max ~10k tokens, bullets densos) e sobrescreva `_summary.md` com ponteiros, contagens, fluxos e gaps — nunca o JSON completo.
   "")
   ```
6. Popule `architecture.json` com o head Git atual (ou `UNKNOWN`), timestamps UTC, IDs estáveis e somente fatos/evidências sem secrets ou PII. Escreva/atualize a narrativa Markdown sem substituir suas lições humanas.
7. Valide primeiro e só então gere `architecture.html`; um JSON inválido bloqueia a atualização do HTML e deve permanecer explícito, nunca ser silenciosamente substituído. Gere/atualize `_summary.md` em um checkpoint coerente com ponteiro, snapshot/status, contagens, nomes/IDs de fluxos críticos e gaps abertos — nunca o JSON completo.
8. Mostre ao usuário o resumo do scan realizado

Se `.pi/memory/` já existe, mas `architecture.json` está ausente, não trate o repositório como novo: preserve os Markdown/GitHub e inicialize o mapa somente quando arquitetura for relevante, seguindo os passos de população, validação, renderização e summary acima.

---

## REGRA 3 — MAPA ARQUITETURAL INCREMENTAL (JSON + HTML)

Markdown continua sendo a autoridade para lições narrativas humanas. O JSON é uma camada aditiva, normalizada e agent-facing; o HTML é sempre derivado do JSON e nunca é entrada de agentes.

Atualize `architecture.json` somente quando houver mudança material em arquitetura, fluxo, evidência ou gap — não a cada edição de código. Antes de mutar:
- Compare `snapshot.sourceHead` com o Git atual; mismatch é `POSSIBLY_STALE`, não prova de erro. Verifique a evidência afetada antes de alterar registros.
- Derive o fechamento dos artefatos afetados a partir dos `evidence.path`/`evidenceIds`; preserve IDs estáveis e registros não afetados.
- Atualize ou remova relações e passos de fluxo atomicamente, para que nenhuma referência fique dangling. Se a fonte não sustenta uma afirmação, marque-a `unknown`/gap `open` em vez de inventar.
- Atualize `sourceHead`, `lastVerifiedAt`, `scope` e confiança conforme a evidência real; não grave status transitório de entrega.

Checkpoint obrigatório: atualizar a narrativa Markdown necessária e o JSON, validar o JSON, renderizar o HTML e só depois atualizar `_summary.md`. Se a validação falhar, não renderize nem aceite HTML; reporte o erro explicitamente. Nunca use o HTML para reconstruir ou substituir o JSON.

Comandos, executados na raiz do projeto e resolvidos relativamente ao diretório desta skill:
```sh
PI_AGENT_DIR="${PI_AGENT_DIR:-$HOME/.pi/agent}"
SKILL_DIR="$PI_AGENT_DIR/skills/project-memory"
node "$SKILL_DIR/scripts/validate-architecture.mjs" .pi/memory/architecture.json
node "$SKILL_DIR/scripts/render-architecture.mjs" .pi/memory/architecture.json .pi/memory/architecture.html
```

## REGRA 4 — SAVE (adicionar nova informação)

Quando descobrir algo novo durante o trabalho:
1. Determine qual arquivo `.md` é o correto e monte o conteúdo da nova entrada
2. Para entrada pequena, edite diretamente. Para entrada grande/múltiplos arquivos, delegue para builder:
   ```
   Agent(subagent_type="builder", prompt=""
   Adicione a seguinte entrada no final do arquivo .pi/memory/{campo}.md:

   ## {Título da Entrada}
   - **Data**: {YYYY-MM-DD}
   - {detalhes}
   - **Arquivos relacionados**: {paths}

   Após adicionar, leia TODOS os arquivos .md em .pi/memory/ (exceto _summary.md),
   sintetize um resumo unificado (max ~10k tokens, bullets densos)
   e sobrescreva .pi/memory/_summary.md com o write.
   "")
   ```
3. Regere `_summary.md` após a gravação. Se usar builder, peça para ele gravar e regenerar em uma única chamada.

**Quando salvar automaticamente:**
- Bug fix concluído → `bugs.md`
- Incidente de deploy/recovery/rollback confirmado → `bugs.md` + `setup.md`
- Nova feature que altera arquitetura → `architecture.md`
- Mudança em scripts/config → `setup.md`
- Decisão técnica tomada → `decisions.md`
- Descoberta de quirk de API → `api-external.md`
- Mudança em variáveis de ambiente → `env.md`

**Lição operacional mínima:** registre apenas fatos duráveis: sintoma, causa raiz comprovada, suposição errada, sequência correta, pré-requisitos, smoke pós-operação, rollback e arquivos/comandos relevantes. Antes de repetir deploy, migration ou recovery, consulte essa entrada e confirme contra o estado atual. Nunca grave valores secretos, output sensível bruto, estado transitório do board/PR, conjecturas ou narrativa do chat; use `[REDACTED]` e mantenha GitHub/host/repo atuais como autoridade.

---

## REGRA 5 — EDIT (atualizar informação existente)

Quando algo mudar que afeta memória já salva:
1. Determine qual arquivo `.md` e qual seção precisa ser atualizada
2. Para edição pequena, edite diretamente. Para edição grande/múltiplos arquivos, delegue para builder:
   ```
   Agent(subagent_type="builder", prompt=""
   Edite o arquivo .pi/memory/{campo}.md:
   - Encontre a seção '## {Título da Entrada}'
   - {descreva exatamente o que mudar}

   Após editar, leia TODOS os arquivos .md em .pi/memory/ (exceto _summary.md),
   sintetize um resumo unificado (max ~10k tokens, bullets densos)
   e sobrescreva .pi/memory/_summary.md com o write.
   "")
   ```
3. Regere `_summary.md` após a edição. Se usar builder, peça para ele editar e regenerar em uma única chamada.

Exemplos de quando editar:
- Bug foi resolvido → atualiza status para [RESOLVIDO] em `bugs.md`
- Arquitetura mudou → atualiza seção em `architecture.md`
- Decisão foi revertida → atualiza em `decisions.md`
- Setup mudou (novo script, nova dep) → atualiza `setup.md`

---

## REGRA 6 — DELETE (remover informação obsoleta)

Quando memória não é mais relevante:
1. Determine qual arquivo `.md` e qual seção precisa ser removida
2. Para remoção pequena, edite diretamente. Para remoção grande/múltiplos arquivos, delegue para builder:
   ```
   Agent(subagent_type="builder", prompt=""
   Remova a seção '## {Título da Entrada}' do arquivo .pi/memory/{campo}.md.

   Após remover, leia TODOS os arquivos .md em .pi/memory/ (exceto _summary.md),
   sintetize um resumo unificado (max ~10k tokens, bullets densos)
   e sobrescreva .pi/memory/_summary.md com o write.
   "")
   ```
3. Regere `_summary.md` após a remoção. Se usar builder, peça para ele remover e regenerar em uma única chamada.

---

## REGRA 7 — REGENERAÇÃO DO `_summary.md`

Regere `_summary.md` sempre que a memória persistente mudar. O modelo principal pode fazer isso diretamente para mudanças pequenas; use builder quando a atualização exigir sintetizar muitos arquivos ou grandes blocos de scout output.

Se por algum motivo precisar regenerar isoladamente:
```
Agent(subagent_type="builder", prompt=""
Leia TODOS os arquivos .md em .pi/memory/ (exceto _summary.md),
sintetize um resumo unificado (max ~10k tokens, bullets densos)
e sobrescreva .pi/memory/_summary.md com o write.
"")
```

- NÃO re-injete na sessão atual — a sessão já tem contexto da conversa
- A próxima sessão que abrir vai pegar o resumo atualizado automaticamente via extension

---

## REGRA 8 — BUSCA NA MEMÓRIA

**Busca rápida** (na memória `.md`):
1. Use `bash` com `grep -n "termo" .pi/memory/*.md` para buscar em todos os arquivos
2. Ou use `read` para ler um arquivo `.md` específico inteiro

**Busca arquitetural direcionada**:
3. Faça lookup pontual em `.pi/memory/architecture.json` por IDs, `evidenceIds`, `path`, `relationshipIds` e fluxos afetados; leia a evidência repository-relative antes de decidir.
4. `architecture.html` é apenas view gerada: nunca pesquise nele como autoridade, nem o injete ou reconstrua o JSON a partir dele.

**Busca profunda** (no codebase):
5. Use o Agent scout quando precisar de detalhes que a memória não cobre:
   ```
   Agent(subagent_type="scout", prompt="Busque no projeto: {descrição detalhada do que precisa}")
   ```
   O scout é barato/rápido e retorna resultados estruturados.
6. Se a busca revelar info relevante, SAVE/EDIT na memória (Regra 3 quando material para arquitetura; caso contrário, a regra Markdown existente).

Use busca ANTES de decisões arquiteturais, debugging complexo, ou quando o usuário pedir "busca na memória sobre X".

---

## REGRA 9 — CHECKLIST OBRIGATÓRIO (antes de enviar resposta)

Execute mentalmente antes de CADA resposta:
```
[ ] Eu executei alguma ação que gerou ou alterou conhecimento do projeto?
[ ] Se sim, eu salvei/editei o arquivo .md correto e regenerei _summary.md?
[ ] Se a mudança foi arquitetural/material, validei JSON e regenerei HTML antes do summary?
[ ] Preservei Flow/GitHub como autoridade, sem secrets, PII, dumps de fonte ou status transitório de entrega?
[ ] Se a mudança era grande, eu considerei delegar para builder?
```

---

## REGRA 10 — FORMATO DAS ENTRADAS

Cada entrada em um arquivo `.md` deve seguir:
```markdown
## Título Descritivo da Entrada
- **Data**: YYYY-MM-DD
- **Detalhe 1**: descrição
- **Detalhe 2**: descrição
- **Arquivos relacionados**: path/to/file1, path/to/file2
```

- `bugs.md`: use status [ATIVO] ou [RESOLVIDO]
- `decisions.md`: Decisão + Alternativas consideradas + Motivo da escolha
- `architecture.md`: inclua diagramas mermaid quando relevante
- `env.md`: secrets como [REDACTED]
