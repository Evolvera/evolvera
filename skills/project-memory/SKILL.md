---
name: project-memory
description: "Memória persistente por projeto via arquivos markdown em .pi/memory/. Auto-scan profundo com scout em paralelo, resumo contextual, busca e edição. Ativa automaticamente em todo projeto."
---

=== PROJECT-MEMORY PROTOCOL ===

## LOCALIZAÇÃO
Toda memória de projeto fica em: `{cwd}/.pi/memory/`

| Arquivo | Descrição |
|---------|-----------|
| `_summary.md` | Resumo compacto (max ~10k tokens). Injetado AUTOMATICAMENTE pela extension no início de cada sessão via hook before_agent_start. |
| `setup.md` | Como rodar, buildar, testar, deploy. Scripts, dependências, runtime. |
| `bugs.md` | Bugs conhecidos com status [ATIVO]/[RESOLVIDO]. Workarounds e fixes. |
| `architecture.md` | Padrão de projeto, estrutura de dirs, fluxos de dados (mermaid), endpoints. |
| `env.md` | Variáveis de ambiente obrigatórias e opcionais. Secrets como [REDACTED]. |
| `api-external.md` | APIs de terceiros, rate limits, quirks. |
| `decisions.md` | Decisões técnicas. Decisão + alternativas + motivo. |

---

## REGRA 1 — INÍCIO DE SESSÃO (AUTOMÁTICO VIA EXTENSION)

A extension `project-memory.ts` injeta o conteúdo de `.pi/memory/_summary.md` automaticamente no system prompt via hook `before_agent_start`.
Se o conteúdo injetado disser que NÃO existe memória → execute o SCAN INICIAL (Regra 2) IMEDIATAMENTE antes de responder qualquer coisa.

---

## REGRA 2 — SCAN INICIAL (SCOUT EM PARALELO)

Se `.pi/memory/` não existe no projeto atual:

1. Crie o diretório: `mkdir -p .pi/memory/`
2. Copie os templates: `cp ~/.pi/agent/skills/project-memory/templates/*.md .pi/memory/`
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
5. **Delegue para o builder** popular os arquivos com todo o resultado:
   ```
   Agent(subagent_type="builder", prompt=""
   Popule a memória do projeto em .pi/memory/ com os dados do scan:

   === DADOS DO SCOUT A (Setup & Infra) ===
   {cole aqui o resultado do Scout A}

   === DADOS DO SCOUT B (Architecture & APIs) ===
   {cole aqui o resultado do Scout B}

   === DADOS DO SCOUT C (Env, Bugs & Decisões) ===
   {cole aqui o resultado do Scout C}

   Para cada arquivo em .pi/memory/ (setup.md, bugs.md, architecture.md, env.md, api-external.md, decisions.md):
   1. Use write para popular com os dados relevantes do scan
   2. Mantenha o formato: ## Título + bullets + data
   Depois, leia todos os .md (exceto _summary.md), sintetize um resumo (max ~10k tokens, bullets densos)
   e sobrescreva .pi/memory/_summary.md com write.
   "")
   ```
6. O builder popula TODOS os .md E gera o `_summary.md` em uma única chamada
7. Mostre ao usuário o resumo do scan realizado

---

## REGRA 3 — SAVE (adicionar nova informação)

Quando descobrir algo novo durante o trabalho:
1. Determine qual arquivo `.md` é o correto e monte o conteúdo da nova entrada
2. **Delegue para o builder** executar a gravação:
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
3. O builder faz a gravação E regenera o `_summary.md` em uma única chamada

**Quando salvar automaticamente:**
- Bug fix concluído → `bugs.md`
- Nova feature que altera arquitetura → `architecture.md`
- Mudança em scripts/config → `setup.md`
- Decisão técnica tomada → `decisions.md`
- Descoberta de quirk de API → `api-external.md`
- Mudança em variáveis de ambiente → `env.md`

---

## REGRA 4 — EDIT (atualizar informação existente)

Quando algo mudar que afeta memória já salva:
1. Determine qual arquivo `.md` e qual seção precisa ser atualizada
2. **Delegue para o builder** executar a edição:
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
3. O builder faz a edição E regenera o `_summary.md` em uma única chamada

Exemplos de quando editar:
- Bug foi resolvido → atualiza status para [RESOLVIDO] em `bugs.md`
- Arquitetura mudou → atualiza seção em `architecture.md`
- Decisão foi revertida → atualiza em `decisions.md`
- Setup mudou (novo script, nova dep) → atualiza `setup.md`

---

## REGRA 5 — DELETE (remover informação obsoleta)

Quando memória não é mais relevante:
1. Determine qual arquivo `.md` e qual seção precisa ser removida
2. **Delegue para o builder** executar a remoção:
   ```
   Agent(subagent_type="builder", prompt=""
   Remova a seção '## {Título da Entrada}' do arquivo .pi/memory/{campo}.md.

   Após remover, leia TODOS os arquivos .md em .pi/memory/ (exceto _summary.md),
   sintetize um resumo unificado (max ~10k tokens, bullets densos)
   e sobrescreva .pi/memory/_summary.md com o write.
   "")
   ```
3. O builder faz a remoção E regenera o `_summary.md` em uma única chamada

---

## REGRA 6 — REGENERAÇÃO DO `_summary.md` (AUTOMÁTICA VIA BUILDER)

A regeneração do `_summary.md` é SEMPRE feita pelo builder junto com a operação de SAVE/EDIT/DELETE.
O modelo principal NÃO precisa regenerar manualmente — basta delegar para o builder
que ele já faz a operação + regeneração em uma única chamada.

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

## REGRA 7 — BUSCA NA MEMÓRIA

**Busca rápida** (na memória `.md`):
1. Use `bash` com `grep -n "termo" .pi/memory/*.md` para buscar em todos os arquivos
2. Ou use `read` para ler um arquivo `.md` específico inteiro

**Busca profunda** (no codebase):
3. Use o Agent scout quando precisar de detalhes que a memória não cobre:
   ```
   Agent(subagent_type="scout", prompt="Busque no projeto: {descrição detalhada do que precisa}")
   ```
   O scout é barato (MiniMax M2.7) e retorna resultados estruturados.
4. Se a busca revelar info relevante, SAVE na memória (Regra 3).

Use busca ANTES de decisões arquiteturais, debugging complexo, ou quando o usuário pedir "busca na memória sobre X".

---

## REGRA 8 — CHECKLIST OBRIGATÓRIO (antes de enviar resposta)

Execute mentalmente antes de CADA resposta:
```
[ ] Eu executei alguma ação que gerou ou alterou conhecimento do projeto?
[ ] Se sim, eu deleguei para o builder salvar/editar o arquivo .md + regenerar _summary.md?
[ ] Se não deleguei, PARE TUDO e chame o builder AGORA.
```

---

## REGRA 9 — FORMATO DAS ENTRADAS

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
