# PI Coding Agent - Guia Completo e Deep Dive

**Data:** 2026-04-29  
**Pesquisador:** Deep Search Master  
**Confidence:** Alta (fontes: documentação oficial, código fonte, AGENTS.md do sistema)

---

## Executive Summary

O PI Coding Agent é um "terminal coding harness" minimalista e extensível criado por **Mario Zechner** (@badlogic). Diferencia-se de outros assistants pela filosofia "adapt pi to your workflows, not the other way around" — em vez de Opinionated software com features Opinionated, o PI oferece primitivas mínimas que podem ser estendidas via Extensions (TypeScript), Skills (markdown com instruções), Prompt Templates, e Themes.

O sistema de roteamento automático utiliza agentes especializados (scout, planner, builder, validator, deep-search-master, pi-steward, agent-expert) que orquestram desde explorações de código até implementações completas com quality gates.

---

## 1. O Que É o PI Coding Agent

### 1.1 Definição e Propósito

O PI é um **coding harness** — um ambiente de trabalho para coding agents que roda no terminal. Não é um agent por si só; é o _harness_ que executa agents configurados para diferentes tarefas.

**Características fundamentais:**
- Minimalista por design — o core tem ~4 tools nativas (read, write, edit, bash)
- Extensível via TypeScript Extensions, Skills, Prompt Templates, Themes
- Suporta múltiplos providers e modelos (Anthropic, OpenAI, Google, DeepSeek, etc.)
- 4 modos de operação: interactive, print, JSON, RPC/SDK

**Instalação:**
```bash
npm install -g @mariozechner/pi-coding-agent
export ANTHROPIC_API_KEY=sk-ant-...
pi
```

### 1.2 Diferença de Outros Assistants

| Aspecto | PI | Claude Code | GitHub Copilot | Cursor |
|---------|-----|-------------|----------------|--------|
| Core Philosophy | Extensível, minimal | Opinionated | IDE-integrated | IDE-integrated |
| MCP Support | Não (extensão opcional) | Sim | Sim | Sim |
| Sub-agents | Não built-in (via extensão) | Não | Não | Não |
| Plan mode | Não built-in (via extensão) | Sim | Não | Sim |
| Permissão popups | Não (containerização) | Sim | Sim | Sim |
| Extensibilidade | TypeScript Extensions | API limitada | Extensões | Plugins |

**Filosofia explicada** (do README.md):
> "Pi is aggressively extensible so it doesn't have to dictate your workflow. Features that other tools bake in can be built with extensions, skills, or installed from third-party packages."

### 1.3 Mario Zechner (Criador)

- GitHub: [@badlogic](https://github.com/badlogic)
- Twitter/X: @badlogicgames
- Mantém o ecossistema `pi-*` no npm: `@mariozechner/pi-coding-agent`, `@mariozechner/pi-ai`, `@mariozechner/pi-agent`, `@mariozechner/pi-tui`
- Também mantém [pi-share-hf](https://github.com/badlogic/pi-share-hf) para publicar sessões no HuggingFace
- Contribuidor ativo com posts em [mariozechner.at](https://mariozechner.at)

### 1.4 Repositório e Documentação

- **npm:** [@mariozechner/pi-coding-agent](https://www.npmjs.com/package/@mariozechner/pi-coding-agent)
- **GitHub mono-repo:** [badlogic/pi-mono](https://github.com/badlogic/pi-mono)
- **Skills oficiais:** [badlogic/pi-skills](https://github.com/badlogic/pi-skills)
- **Discord:** Community em [discord.gg/3cU7Bz4UPx](https://discord.com/invite/3cU7Bz4UPx)
- **Website:** [pi.dev](https://pi.dev)

---

## 2. Sistema de Agentes

### 2.1 Agentes Disponíveis e Quando Usar

O sistema de roteamento automático do PI utiliza os seguintes agentes:

| Agente | Quando Usar | Modo de Chamada |
|--------|------------|-----------------|
| `scout` | Explorar/mapear código sem implementar | `Agent(subagent_type="scout", prompt="<missão>")` |
| `planner` | Planejar features complexas, refactors, arquitetura | `Agent(subagent_type="planner", prompt="<descrição>")` |
| `builder` | Implementar código a partir de plano | `Agent(subagent_type="builder", prompt="<plano>")` |
| `validator` | Validar/auditar código antes de merge | `Agent(subagent_type="validator", prompt="<escopo>")` |
| `deep-search-master` | Pesquisa profunda com validação cruzada | `Agent(subagent_type="deep-search-master", prompt="deep search: <tema>")` |
| `pi-steward` | Reportar erros do PI, alucinações, features faltantes | `Agent(subagent_type="pi-steward", prompt="<problema>")` |
| `agent-expert` | Criar/modificar agentes customizados | Planejamento prévio → `Agent(subagent_type="agent-expert", ...)` |

### 2.2 Prefixos de Pesquisa

| Prefixo | Modo | Descrição |
|---------|------|-----------|
| `quick:` | QUICK MODE | Resposta direta, sem YAML, até 3 turnos |
| `verify:` | VERIFY MODE | Validação de claims existentes via Auditor |
| `deep search:` / `pesquisa profunda:` | FULL PIPELINE | 4 fases: coleta paralela, auditor, re-busca, finalização |

### 2.3 Pipeline Completa: scout → planner → builder → validator

```
scout  →  mapeia codebase (inteligência)
   ↓
planner → gera plano detalhado (plans/*.md)
   ↓
builder → executa plano (branch isolada, TILL-DO → TODO → Final Verification)
   ↓
validator → quality gate final (testes, segurança, observabilidade)
```

**Quando pular etapas:**
- Tarefa trivial (mudar texto, CSS, prop simples) → fazer direto
- Tarefa média com plano informal → `builder` direto
- Mudança pequena mas crítica (auth, payment, PII) → `builder` + `validator`
- Mudança de alto impacto → pipeline completa

### 2.4 agent-expert: Criando Agentes Customizados

Fluxo obrigatório:
1. Gerar plano simples (nome, propósito, tools, comportamento)
2. Apresentar ao usuário e pedir confirmação
3. Aguardar confirmação
4. Só então chamar `agent-expert`

**Parâmetros típicos de um agente:**
- `subagent_type` — tipo do agente
- `prompt` — instruções e missão
- `model` (opcional) — override de modelo
- `thinking` (opcional) — nível de thinking (off, minimal, low, medium, high, xhigh)
- `max_turns` (opcional) — limite de turnos
- `inherit_context` (opcional) — se herda contexto da sessão
- `isolated` (opcional) — se roda em worktree isolado

---

## 3. Skills do PI

### 3.1 O Que São Skills

Skills são **pacotes de capacidade self-contained** que o agent carrega on-demand. Uma skill fornece workflows especializados, instruções de setup, scripts helper, e documentação de referência para tarefas específicas.

Implementa o [Agent Skills standard](https://agentskills.io/specification).

### 3.2 Skills Disponíveis no Sistema

| Skill | Descrição |
|-------|-----------|
| `deep-research-v2` | Pipeline de pesquisa profunda com 4 fases (coleta paralela, auditor red team, re-busca focada, finalização) |
| `git-research` | Helper para clonar repositórios temporariamente para pesquisa |
| `mcp-vision` | Processa imagens coladas quando o modelo não suporta vision |
| `pi-tool-expert` | Expert em criação de extensions TypeScript e tools customizadas |
| `synabun` | Memória vetorial persistente via MCP (pi-mcp-adapter) |

### 3.3 Estrutura de um Skill

```
my-skill/
├── SKILL.md              # Required: frontmatter + instruções
├── scripts/              # Scripts helper
│   └── process.sh
├── references/           # Docs carregadas on-demand
│   └── api-reference.md
└── assets/
    └── template.json
```

**SKILL.md format:**
```markdown
---
name: my-skill
description: O que este skill faz e quando usar. Seja específico.
---

# My Skill

## Setup

```bash
cd /path/to/skill && npm install
```

## Usage

```bash
./scripts/process.sh <input>
```
```

**Frontmatter obrigatório:**
| Campo | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Max 64 chars, lowercase a-z, 0-9, hyphens. Deve corresponder ao diretório pai. |
| `description` | Yes | Max 1024 chars. O que o skill faz e quando usar. |

### 3.4 Como Criar Skills Personalizados

1. Criar diretório com nome válido (lowercase, hyphens, max 64 chars)
2. Criar `SKILL.md` com frontmatter YAML
3. `name` no frontmatter deve corresponder ao nome do diretório
4. Usar caminhos relativos para referenciar scripts/assets
5. Testar com `/skill:nome`

### 3.5 pi-tool-expert: Criando Extensions TypeScript

O skill `pi-tool-expert` fornece conhecimento profundo para criar extensions. **Workflow obrigatório:**

**Fase 1: Introspeção do Ambiente**
```bash
ls ~/.pi/agent/extensions/
ls ~/.pi/agent/skills/
cat ~/.pi/agent/settings.json
cat ~/.pi/agent/mcp.json 2>/dev/null
ls /Users/j.henrique/npm-global/lib/node_modules/@mariozechner/pi-coding-agent/docs/
ls /Users/j.henrique/npm-global/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/
```

**Fase 2: Planejamento**
- Definir objetivo claramente
- Identificar abordagem: Extensão (tools customizadas), Skill (instruções), MCP Server (serviços externos), AGENTS.md (contexto)
- Mapear dependências e conflitos

**Fase 3: Implementação**
```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  pi.on("event_name", async (event, ctx) => { /* ... */ });
  
  pi.registerTool({
    name: "tool_name",
    label: "Tool Name",
    description: "O que faz",
    parameters: Type.Object({ /* schema */ }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return { content: [{ type: "text", text: "resultado" }], details: {} };
    },
  });
  
  pi.registerCommand("cmd", { description: "...", handler: async (args, ctx) => { /* ... */ } });
}
```

**Fase 4: Validação**
- Export default function recebe `ExtensionAPI`
- Tipos importados corretamente
- Schema com `description` em todos os campos
- Nomes únicos (não conflitar com built-ins)
- JSON válido no mcp.json para MCP

---

## 4. Tools Nativas e Bridge

### 4.1 Tools Nativas

O PI oferece 4 tools nativas por default:

| Tool | Descrição |
|------|-----------|
| `read` | Ler arquivos locais |
| `write` | Escrever/criar arquivos |
| `edit` | Editar targeted changes em arquivos existentes |
| `bash` | Executar comandos shell |

Tools adicionais disponíveis: `grep`, `find`, `ls`

### 4.2 VS Code Bridge Tools

O sistema pode operar com VS Code live IDE bridge. Ferramentas disponíveis:
- `vscode_get_diagnostics` — verificar erros de tipo/lint em tempo real
- Diagnósticos, selection, editor state
- Symbols, definitions, hovers, references, code actions
- Workspace symbols

### 4.3 MCP Gateway (Model Context Protocol)

O PI não tem MCP built-in, mas pode adicionar via extensão. Com o `pi-mcp-adapter`, tools MCP são prefixadas:

| Ferramenta MCP | Nome no PI |
|----------------|-----------|
| `remember` | `mcp_SynaBun_remember` |
| `recall` | `mcp_SynaBun_recall` |
| `forget` | `mcp_SynaBun_forget` |
| `restore` | `mcp_SynaBun_restore` |
| `reflect` | `mcp_SynaBun_reflect` |
| `memories` | `mcp_SynaBun_memories` |
| `sync` | `mcp_SynaBun_sync` |

### 4.4 Tools de Internet

| Tool | Uso |
|------|-----|
| `minimax-web-search` | Busca web, encontrar documentação |
| `jina_read` | Extrair conteúdo de URLs, PDFs, GitHub README |

### 4.5 Tools PI Especiais

| Tool | Propósito |
|------|-----------|
| `pi_env_inspect` | Inspecionar ambiente PI |
| `pi_validate_skill` | Validar skill contra Agent Skills standard |
| `pi_validate_extension` | Validar extensão TypeScript |
| `pi_check_name_conflicts` | Verificar conflitos de nome |

---

## 5. Extensões TypeScript

### 5.1 Como Criar Extensions

Extensions são módulos TypeScript que estendem o comportamento do PI. Estrutura mínima:

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  // Registrar tools
  pi.registerTool({ name: "my_tool", ... });
  
  // Registrar comandos (/mycommand)
  pi.registerCommand("mycmd", { ... });
  
  // Registrar atalhos de teclado
  pi.registerShortcut("ctrl+x", { ... });
  
  // Escutar eventos
  pi.on("tool_call", async (event, ctx) => { ... });
}
```

### 5.2 Localizações de Extensions

| Localização | Escopo |
|-------------|--------|
| `~/.pi/agent/extensions/*.ts` | Global (todos os projetos) |
| `~/.pi/agent/extensions/*/index.ts` | Global (subdiretório) |
| `.pi/extensions/*.ts` | Projeto-local |
| `.pi/extensions/*/index.ts` | Projeto-local (subdiretório) |

### 5.3 Eventos Disponíveis

**Lifecycle:**
- `session_start` — quando sessão inicia
- `session_shutdown` — quando sessão termina
- `before_agent_start` — antes do agent iniciar (pode injetar mensagem, modificar system prompt)
- `agent_start` / `agent_end` — início/fim do agent
- `turn_start` / `turn_end` — início/fim de cada turn

**Tool Events:**
- `tool_call` — quando LLM chama tool (pode bloquear)
- `tool_result` — resultado da tool (pode modificar)
- `tool_execution_start` / `tool_execution_end`
- `tool_execution_update`

**Provider Events:**
- `before_provider_request` — antes de chamar provider (pode inspecionar/modificar payload)
- `after_provider_response` — após resposta do provider

**Input Events:**
- `input` — interceptar input do usuário

### 5.4 pi_validate_extension

Use para validar extensions antes de distribuir. Verifica:
- Export default function recebe `ExtensionAPI`
- Tipos importados corretamente
- Schema completo com descriptions
- Nomes únicos (sem colisão com built-ins)
- Retorno correto das tools

### 5.5 Exemplos de Extensions

O diretório `examples/extensions/` contém 50+ exemplos:
- `hello.ts` — extensão mínima
- `permission-gate.ts` — блокирует comandos perigosos
- `git-checkpoint.ts` — stash automático por turn
- `protected-paths.ts` — protege caminhos como `.env`
- `auto-commit-on-exit.ts` — commit automático ao sair
- `subagent/` — implementação de subagentes
- `doom-overlay/` — Doom rodando enquanto espera
- `plan-mode/` — modo plan integrado
- `with-deps/` — extensão com dependências npm

---

## 6. Git Workflow e Disciplina

### 6.1 Branch Isolada

O builder cria branch no formato: `agent/<timestamp>-<desc>`

```bash
git checkout -b agent/20260429-145500-minha-feature
```

Anota base commit para referência.

### 6.2 TILL-DO.md (Sanity Gates)

Sanity gates que **BLOQUEIAM execução** até 100% ✅

```markdown
## TILL-DO: Antes de Codar

- [ ] Entendi o problema completamente
- [ ] Tenho testes para o caso happy path
- [ ] Tenho testes para casos edge
- [ ] Backup feito
```

### 6.3 TODO.md (Steps Atômicos)

Steps atômicos com one-change-one-verification:

```markdown
## TODO

### Step 1: Implementar auth básico
- [ ] Criar `src/auth.ts`
- [ ] Adicionar função `validateToken()`
- [ ] Testar com token válido
- [ ] Testar com token inválido

### Step 2: Integrar com API
- [ ] Adicionar chamada na função `login()`
- [ ] Verificar response structure
```

### 6.4 Final Verification

Checklist final rigoroso:
- [ ] Syntax errors: `tsc --noEmit`
- [ ] Type errors: verificados
- [ ] Imports corretos
- [ ] Testes passando
- [ ] Edge cases cobertos
- [ ] Secrets não commitados
- [ ] `git diff` revisado

### 6.5 Git Safety Rules

- Preferir ações reversíveis: `git stash` antes de mudanças arriscadas
- Usar `git diff` e `git status` antes de commitar
- Criar novas branches ao invés de commitar em main
- Avisar antes de `git push --force`
- Nunca criar GitHub repo sem perguntar

---

## 7. Quality Gates e Validator

### 7.1 O Que o Validator Faz

O `validator` é um quality gate completo que audita:
- **Testes** — cobertura, casos faltantes
- **Segurança** — vulnerabilidades, secrets expostos
- **Observabilidade** — logs estruturados, tracing
- **Arquitetura** — aderência a SOLID, DRY, KISS

### 7.2 Quando é Invocado Automaticamente

O validator é invocado **automaticamente** após o builder quando:
- Mudanças de alto impacto (security, data flow, external APIs, critical paths)
- Mudanças muito extensas (>10 arquivos alterados)

**Não perguntar — fazer direto.**

### 7.3 Output do Validator

O validator pode:
- Gerar testes faltantes
- **BLOQUEAR código ruim** independentemente da fonte
- Reportar violations com severidade
- Sugerir correções

---

## 8. Resiliência e Engenharia

### 8.1 Circuit Breaker

O sistema segue padrão Circuit Breaker:
- **Fail-fast OPEN:** quando falhas excedem threshold
- **Log state transitions:** transições de estado são logadas
- **Half-open:** após timeout, tenta uma requisição

### 8.2 Retries

- **Exponential backoff + jitter** para retries
- **Transient only:** apenas para erros 429, 5xx
- **Max 3 retries** por padrão
- **Idempotent operations:** operações idempotentes apenas
- **Async → DLQ:** falhas async vão para Dead Letter Queue

### 8.3 Race Conditions

Prioridade de soluções:
1. **Atomic** operations
2. **Optimistic lock**
3. **Distributed lock**
4. **Pessimistic lock**

Database: `SELECT ... FOR UPDATE` para locks.

### 8.4 Feature Flags

- Dependências stateless
- Nunca hardcode `if True/False`
- Planjar cleanup para Release/Experiment toggles

### 8.5 Logs Estruturados

Formato estruturado JSON com campos obrigatórios:
```json
{
  "timestamp": "2026-04-29T14:55:00Z",
  "level": "info",
  "message": "Request processed",
  "service": "my-service",
  "trace_id": "abc123"
}
```

**PII mask:** dados sensíveis mascarados como `[REDACTED]`

### 8.6 RED Pattern (Metrics/Tracing)

- **Rate:** requests por segundo
- **Errors:** taxa de erros
- **Duration:** latência

Propagar `trace_id`/`span_id` através de boundaries.

---

## 9. MCP - Model Context Protocol

### 9.1 O Que É MCP

O Model Context Protocol é um padrão para conectar LLMs a fontes de dados e ferramentas externas. O PI **não tem MCP built-in**, mas pode ser adicionado via extensão.

### 9.2 Como Conectar MCP Servers

1. Criar/adicionar extensão MCP adapter
2. Editar `~/.pi/agent/mcp.json` (nunca `settings.json` para MCP)
3. Validar JSON antes de salvar
4. Testar com `/mcp-status`

### 9.3 Ferramentas MCP Disponíveis

Via `pi-mcp-adapter`:

| Server | Tools |
|--------|-------|
| SynaBun | remember, recall, forget, restore, reflect, memories, sync, category_* |

### 9.4 synabun Skill (Memória Vetorial Persistente)

O SynaBun fornece memória vetorial persistente para assistentes de IA.

**Nomes das ferramentas no PI:**
- `mcp_SynaBun_remember` — guardar informação
- `mcp_SynaBun_recall` — buscar contexto passado
- `mcp_SynaBun_reflect` — atualizar memórias
- `mcp_SynaBun_forget` / `mcp_SynaBun_restore` — deletar/restaurar
- `mcp_SynaBun_memories` — listar memórias
- `mcp_SynaBun_sync` — detectar desatualizadas

**Auto-Recall:**
- Início de sessão: chamar `recall` com contexto do projeto
- Tópico mencionado: `recall` o que sabes
- Antes de decisões: `recall` decisões passadas
- Debugging: `recall` bugs similares

**Auto-Remember (OBRIGATÓRIO):**
Após qualquer tarefa (bug fix, feature, refatoração, etc.), **DEVES** usar `remember` ANTES de responder.

---

## 10. Problemas e Stewardship

### 10.1 pi-steward

Quando usar:
- PI errou, fez operação destrutiva
- PI alucinou (inventou API, path, etc.)
- MCP caiu ou não conectou
- Feature faltante
- Routing falhou (AGENTS.md não disparou)

**Fluxo:**
1. Coletar contexto
2. Formatar issue
3. Pedir confirmação do usuário
4. Criar issue no GitHub

### 10.2 Como Reportar Erros

Via `pi-steward`:
```javascript
Agent(subagent_type="pi-steward", prompt="Descrição do problema e contexto")
```

O steward:
- Coleta contexto automaticamente
- Formata issue corretamente
- Pede confirmação antes de criar
- Cria issue no GitHub

### 10.3 Gatilhos de Problema

**Manuais (usuário reclama):**
- "o PI errou"
- "abre issue"
- "reporta isso"
- "isso tá errado"
- "o PI fez besteira"

**Automáticos (PI detecta):**
- Chamou tool inexistente
- Apagou arquivo importante
- Alucinou API ou path
- MCP server não conectou
- Routing falhou

---

## 11. Orchestração Multi-Agent

### 11.1 Como Múltiplos Agentes Trabalham Juntos

O sistema utiliza orchestration onde:
- Agente principal delega tarefas especializadas
- Subagentes executam em paralelo ou sequência
- Resultados são consolidados

### 11.2 run_in_background

```javascript
Agent({
  subagent_type: "scout",
  prompt: "Missão...",
  run_in_background: true  // Executa em background
})
```

Usar `get_subagent_result` para coletar resultados:
```javascript
get_subagent_result({ agent_id: "xxx", wait: true })
```

### 11.3 resume

Retomar sessão anterior:
```bash
pi -r  # Browse e seleciona
pi --session <path|id>  # Session específica
```

### 11.4 steer_subagent

 steering messages para guiar subagente durante execução.

### 11.5 isolation: worktree

Para tarefas que precisam de isolamento:
- Cada agente pode usar worktree git separado
- Compartilha objetos git (eficiente)
- Não polui branch principal

---

## 12. Recursos Avançados de Agentes

### 12.1 model Override

Override do modelo default para um agente específico:
```javascript
Agent({
  subagent_type: "planner",
  model: "kimi",  // Override
  prompt: "..."
})
```

### 12.2 thinking Level

Níveis de thinking disponíveis:
| Level | Descrição |
|-------|-----------|
| `off` | Sem thinking |
| `minimal` | Mínimo reasoning |
| `low` | Reasoning básico |
| `medium` | Reasoning moderado |
| `high` | Reasoning profundo |
| `xhigh` | Reasoning extensivo |

CLI: `--thinking <level>` ou `Shift+Tab` para ciclar.

### 12.3 max_turns

Limitar turnos de execução:
```javascript
Agent({
  subagent_type: "scout",
  max_turns: 5,  // Max 5 turnos
  prompt: "..."
})
```

### 12.4 inherit_context

Se o agente herda contexto da sessão atual:
```javascript
Agent({
  subagent_type: "scout",
  inherit_context: true,  // Default: true
  prompt: "..."
})
```

### 12.5 isolated Mode

Se o agente roda em worktree isolado:
```javascript
Agent({
  subagent_type: "builder",
  isolated: true,  // Worktree separado
  prompt: "..."
})
```

---

## 13. Deep Research Pipeline v2.0

### 13.1 Pipeline de 4 Fases

```
FASE 1: COLETA PARALELA      FASE 2: AUDITOR/RED TEAM      FASE 3: RE-BUSCA FOCADA      FASE 4: FINALIZADOR
(5 Agentes Especialistas)    (1 Agente Auditor)            (3-5 Agentes Cirúrgicos)     (1 Agente Redator)
        │                             │                              │                           │
        ▼                             ▼                              ▼                           ▼
   findings.yaml               validation_memo.md              findings_v2.yaml           relatorio_final.md
   (dados brutos +             (contradições, gaps,            (dados validados,          (texto publicável
    inferências                 regras violadas,                 debunks, novas              com fontes citadas
    separadas)                  plano de validação)             fontes)                    como links)
```

### 13.2 Fase 1: Coleta Paralela

5 agentes em paralelo:
- `deep-research-explorer` — tendências, fontes não-óbvias
- `deep-research-methodical` — fontes primárias, registros oficiais
- `deep-research-critical` — críticas, contradições, red flags
- `deep-research-creative` — conexões inesperadas, ângulos novos
- `deep-research-skeptical` — verificação factual, estatísticas

### 13.3 Fase 2: Auditor / Red Team

O Auditor analisa os 5 YAMLs e detecta:
- Violações do glossário de armadilhas
- Contradições lógicas entre agentes
- Gaps de triangulação
- Plano de validação (missões cirúrgicas)

**Status possíveis:**
- `liberado` → vai direto para Fase 4
- `liberado_com_ressalvas` → Fase 3 para missões críticas
- `bloqueado` → Fase 3 para TODAS as missões

### 13.4 Fase 3: Re-Busca Focada

Para cada missão do plano de validação:
```javascript
Agent({
  subagent_type: "agente_ideal",
  prompt: `Missão ID: M001\nObjetivo: ...\nMax Turnos: 3`,
  run_in_background: true
})
```

### 13.5 Fase 4: Finalizador

Gera relatório final em Markdown com:
- Executive Summary
- Dados Fundamentais (com status de verificação)
- Análise por Dimensão
- Contradições e Gaps Não Resolvidos
- Avaliação de Risco
- Conclusões e Recomendações
- Fontes e Referências
- Apêndice: Metodologia

---

## 14. Configurações e Settings

### 14.1 Arquivos de Configuração

| Local | Escopo |
|-------|--------|
| `~/.pi/agent/settings.json` | Global |
| `.pi/settings.json` | Projeto (sobrescreve global) |

### 14.2 Configurações Importantes

**Model & Thinking:**
```json
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-sonnet-4-20250514",
  "defaultThinkingLevel": "medium"
}
```

**Retry:**
```json
{
  "retry": {
    "enabled": true,
    "maxRetries": 3,
    "baseDelayMs": 2000
  }
}
```

**Compaction:**
```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  }
}
```

---

## 15. Comandos Úteis

### 15.1 Comandos Interativos

| Comando | Descrição |
|---------|-----------|
| `/login`, `/logout` | Autenticação OAuth |
| `/model` | Trocar modelo |
| `/scoped-models` | Habilitar/desabilitar modelos para Ctrl+P |
| `/settings` | Thinking level, theme, message delivery |
| `/resume` | Selecionar de sessões anteriores |
| `/new` | Nova sessão |
| `/tree` | Navegar árvore de sessão |
| `/fork` | Criar nova sessão de mensagem anterior |
| `/compact [prompt]` | Compactar contexto manualmente |
| `/skill:name` | Carregar skill específico |
| `/hotkeys` | Mostrar atalhos |
| `/reload` | Recarregar extensões, skills, etc. |

### 15.2 Atalhos de Teclado

| Tecla | Ação |
|-------|------|
| Ctrl+C | Limpar editor |
| Ctrl+C (2x) | Sair |
| Escape | Cancelar/abortar |
| Escape (2x) | Abrir `/tree` |
| Ctrl+L | Seletor de modelo |
| Ctrl+P / Shift+Ctrl+P | Ciclar modelos |
| Shift+Tab | Ciclar thinking level |
| Ctrl+O | Colapsar/expandir tool output |
| Ctrl+T | Colapsar/expandir thinking blocks |

### 15.3 Message Queue

- **Enter** → mensagem de steering (entregue após turn atual)
- **Alt+Enter** → follow-up (entregue só após agent terminar)
- **Escape** → aborta e restaura mensagens para editor
- **Alt+Up** → recupera mensagens enfileiradas para editor

---

## Conclusão

O PI Coding Agent representa uma abordagem fundamentalmente diferente para coding agents: em vez de Opinionated software com features Opinionated, oferece um harness minimalista e extensível onde o usuário molda o ambiente às suas necessidades.

**Princípios Fundamentais:**
1. **Minimalismo intencional** — core enxuto, extensões opcionais
2. **Extensibilidade total** — TypeScript, Skills, Themes, Prompt Templates
3. **Orquestração inteligente** — agentes especializados para cada tarefa
4. **Qualidade garantida** — validator como quality gate automático
5. **Feedback loop** — pi-steward para melhorar continuamente

A curva de aprendizado é maior que tools Opinionated, mas o controle e flexibilidade resultantes justificam o investimento para desenvolvedores que valorizam customização profunda.

---

**Fontes:**
- [README.md oficial](https://www.npmjs.com/package/@mariozechner/pi-coding-agent)
- [badlogic/pi-mono](https://github.com/badlogic/pi-mono)
- [docs/extensions.md](docs/extensions.md)
- [docs/skills.md](docs/skills.md)
- [AGENTS.md local](/Users/j.henrique/.pi/agent/AGENTS.md)
- [pi-tool-expert skill](/Users/j.henrique/.pi/agent/skills/pi-tool-expert/SKILL.md)
- [deep-research-v2 skill](/Users/j.henrique/npm-global/lib/node_modules/@mariozechner/pi-coding-agent/.pi/skills/deep-research-v2/SKILL.md)
- [synabun skill](/Users/j.henrique/.pi/agent/skills/synabun/SKILL.md)
- [git-research skill](/Users/j.henrique/.pi/agent/skills/git-research/SKILL.md)
- [mcp-vision skill](/Users/j.henrique/.pi/agent/skills/mcp-vision/SKILL.md)

---

*Relatório gerado em: 2026-04-29*
*Deep Search Master — Pipeline v2.0*
