# 🧠 Evolvera PI Setup

Configuração padronizada do [PI Coding Agent](https://github.com/badlogic/pi) para o time.

O **PI** é um agente de código com **orquestração multi-agente** que roda dentro do VS Code. Não é um chatbot — é um sistema de agentes especializados que colaboram entre si para pesquisar, planejar, implementar e validar código. Ele detecta automaticamente a intenção do usuário e encaminha para o agente correto.

### Arquitetura

```
Você (usuário) → PI (roteador inteligente) → Agente correto → Resultado
                         ↑
                    AGENTS.md (regras de roteamento automático)
```

---

## Instalação

```bash
# 1. Clone
git clone git@github.com:Evolvera/Pi.git
cd Pi

# 2. Instala tudo
./install.sh

# 3. Faça login no modelo de IA
pi
/login
```

### Windows

```powershell
# 1. Clone o repositório
git clone git@github.com:Evolvera/Pi.git
cd Pi

# 2. Se necessário, habilite execução de scripts
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

# 3. Execute o instalador
.\install.ps1

# 4. Faça login no modelo de IA
pi
/login
```

**Nota**: Se o PowerShell bloquear o script, use:
```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

O `/login` pede a API key e salva automaticamente. Pronto, já pode usar.

### VS Code

Instale a extensão [PI for VS Code](https://marketplace.visualstudio.com/items?itemName=pi0.pi-vscode) para usar o PI direto no editor.

## Atualizar

```bash
cd Pi
git pull
./install.sh
```

---

## 🤖 Agentes Disponíveis (26)

### Pipeline de Código

| Agente | Emoji | Função | Modelo | Quando usar |
|--------|-------|--------|--------|-------------|
| **Scout Highspeed** | ⚡ | Explorador rápido — mapeia arquivos, dependências, padrões, testes | GPT-5.3 Codex Spark | default para exploração rápida/backend/infra/algoritmos |
| **Scout** | 🔍 | Explorador cauteloso com workflow estruturado | GPT-5.4 mini | quando menor risco de alucinação importa mais que velocidade |
| **Planner** | 🏛️ | Arquiteto — cria planos detalhados para features, refactors, bug fixes | Claude Opus | "planeja X", "desenha arquitetura de Y", "como refatorar Z?" |
| **Planner Heavy** | 🏛️ | Planejador estruturado final do `/plan-heavy`; consome handoff + brief mergeado | GPT-5.5 xhigh | escreve PLAN_FULL/SCHEDULE/TASKS no harness ensemble |
| **Plan Briefer** | 🧩 | Gera UM brief de estratégia/lógica (sem tasks/DAG), afinado pro GPT-5.5 | GPT-5.5 xhigh | fase de brief do `/plan-heavy` |
| **Plan Briefer (Fable)** | 🧩 | Briefer do ensemble com Claude Fable 5 high e Opus 4.8 como fallback manual | Claude Fable 5 high | fase de brief do `/plan-heavy` |
| **Plan Brief Merger** | 🔗 | Funde os 2 briefs em um só, reconciliando divergências | GPT-5.5 high | fase de merge do `/plan-heavy` |
| **Builder Highspeed** | ⚡ | Executor rápido para single-file edits, protótipos, CSS/React tweaks, testes, tooling, backend, lógica/math | GPT-5.3 Codex Spark | usar em tarefas explícitas e verificáveis; evitar tarefas amplas e polish/design final |
| **Builder** | 🔨 | Executor cauteloso com disciplina Git-first, checklists, verificação final | Claude Sonnet 5 medium | quando menor risco de alucinação importa mais que velocidade |
| **Builder Heavy** | 🧠 | Executor robusto GPT-5.5 para integração sutil, arquivos compartilhados, migrações e correções correctness-sensitive | GPT-5.5 medium | quando builder padrão/Spark é arriscado demais, especialmente shared-file hazards ou recuperação pós-falha |
| **Validator** | 🛡️ | Quality gate — valida testes, segurança, arquitetura. Pode gerar testes e BLOQUEIA código ruim | GPT-5.4 mini | "valida esse PR", "audita os testes", "code review" |
| **Website Designer** | 🎨 | Designer de websites — analisa briefings, referencia marcas reais (Stripe, Apple, Linear, etc.) e produz DESIGN_PLAN.md detalhado | GPT-5.5 | "cria um site para X", "builda uma landing page", "faz um site institucional" |
| **Website Home Designer** | 🏠 | Designer enxuto para preview premium de uma Home Page em `index.html` | Claude Fable 5 | "faz uma home preview", "gera um index.html visual" |
| **Website Home Planner** | 🧭 | Escolhe/funde opções de design e cria tarefa autônoma para o builder gerar `index.html` | Claude Fable 5 | etapa planner do fluxo `website-home-preview` |
| **Website Polisher** | ✨ | UI/UX Engineer — audit final, refina shadows/borders/gradients, estados (hover, focus, disabled, loading, error), acessibilidade, polish completo | GPT-5.4 mini | "polish esse site", "refina o design", "melhora a UX" |

### Pipeline Natural

Para mudanças não-triviais:

```
Scout Highspeed/Scout → mapeia codebase
  ↓
Planner → gera plano detalhado (plans/*.md)
  ↓
Builder Highspeed/Builder/Builder Heavy → executa plano
  ↓
Validator → quality gate (testes, segurança, arquitetura)
```

**Quando pular etapas:**
- Tarefa trivial (mudar texto, CSS) → faça direto, sem agentes
- Tarefa média sem plano formal → `builder-highspeed` direto quando explícita/single-file/module-local; `builder` quando cautela importa
- Tarefa correctness-sensitive/shared-file → `builder-heavy` + checkpoint/validator
- Mudança crítica (auth, payment, PII) → builder-heavy ou builder + validator automático
- Mudança muito extensa (>10 files) → pipeline completa

### Website Home Preview Chain

Fluxo autônomo para gerar uma Home Page premium em um único arquivo `index.html`:

```
website-home-designer → website-home-planner → builder → validator
```

**Resultado:** `.pi/previews/<slug>/index.html`

Use quando quiser preview visual/copy de uma Home sem criar projeto completo, sem Next/Tailwind build, e sem human-in-the-loop.

### Website Building Chain

Fluxo completo para criar sites profissionais com referência em marcas reais:

```
website-designer → builder → validator → website-polisher → builder → validator
```

**Passos:**
1. **website-designer** — Analisa briefing, referencia design systems reais (Stripe, Linear, Apple, Vercel, Figma, etc.) e gera `DESIGN_PLAN.md`
2. **builder** — Implementa o design (branch isolada, TILL-DO → TODO → Final Verification)
3. **validator** — Quality gate (compilação, tipos, estrutura)
4. **website-polisher** — Audit UI/UX completo, gera `POLISH_PLAN.md` com correções detalhadas
5. **builder** — Aplica correções do polish
6. **validator** — Quality gate final

**Como usar:**
```
"cria um site para minha clínica"
"builda uma landing page para meu SaaS"
"faz um site institucional com blog"
"/website-brief MeuProjeto  ← preenche briefing e dispara chain
```

### Agentes Especiais

| Agente | Emoji | Função | Quando usar |
|--------|-------|--------|-------------|
| **Agent Expert** | 🤖 | Meta-agente que cria, configura e modifica outros agentes | "cria um agente que faz X" |
| **Pi Steward** | 🚨 | Captura bugs do PI e cria issues no GitHub | "o PI errou", "registra esse problema" |

### Pesquisa Web

Pesquisa web ampla usa as ferramentas Kimi/Moonshot expostas pelo `pi-provider-kimi-code`: `moonshot_search` para descoberta e `moonshot_fetch` para ler páginas. URLs/PDFs fornecidos também podem ser lidos com `jina_read`.

---

## 🛠️ Ferramentas

### Built-in (nativas)

| Tool | Uso |
|------|-----|
| `read` | Ler arquivos (texto e imagens) |
| `bash` | Executar comandos shell |
| `edit` | Edição precisa de arquivos (replace exato) |
| `write` | Criar/sobrescrever arquivos |
| `grep` | Buscar padrão em arquivos |
| `find` | Buscar arquivos por glob |
| `ls` | Listar diretórios |

### VS Code Bridge (integração IDE)

| Ferramenta | Função |
|------------|--------|
| `vscode_get_diagnostics` | Erros LSP/lint/type em tempo real |
| `vscode_get_hover` | Tipos inferidos, signatures, documentação |
| `vscode_get_definitions` | Ir para definição |
| `vscode_get_references` | Encontrar todas as referências |
| `vscode_get_implementations` | Encontrar implementações concretas |
| `vscode_get_code_actions` | Quick fixes disponíveis |
| `vscode_format_document` | Formatador ativo do VS Code |
| `vscode_open_file` | Abrir arquivo no editor |
| `vscode_get_selection` | Seleção atual (texto, caminho, coordenadas) |
| `vscode_get_document_symbols` | Outline/símbolos do arquivo |
| `vscode_get_workspace_symbols` | Buscar símbolos no workspace |
| `vscode_save_document` | Salvar documento via VS Code |
| `vscode_show_notification` | Mostrar notificação no VS Code |

### MCP Servers (2)

| Server | Ferramentas | Função |
|--------|-------------|--------|
| **context7** | 2 tools | Documentação de bibliotecas |
| **memory** | 9 tools | Memória/conhecimento persistente |

Busca web paga via MiniMax/ZAI foi removida. Para pesquisa externa, use fontes/URLs fornecidas com `jina_read` ou adicione um novo provedor MCP de busca.

---

## 📦 Skills

| Skill | O que faz |
|-------|-----------|
| `agent-guide` | Guia de delegação para scout/planner/builder |
| `builder` | Workflow para implementar mudanças focadas |
| `design-catalog` | Catálogo de design systems reais para referência visual |
| `design-extractor` | Extrai design system a partir de URL usando `jina_read` |
| `git-research` | Clona repos temporariamente para pesquisa com cleanup automático |
| `pi-tool-expert` | Guia completo para criar/modificar extensões, tools e MCP |
| `planner` | Workflow para planejamento multi-file |
| `project-memory` | Memória persistente por projeto |
| `scout` | Exploração read-only do codebase |
| `website-home-preview` | Fluxo autônomo para Home Page premium em `index.html` |
| `website-pipeline` | Orquestração design → conteúdo → plano → build |
| `website-stack` | Convenções de stack para websites |

## 🔌 Extensões (7)

| Extensão | O que faz |
|----------|-----------|
| `auto-image-clipboard.ts` | Captura imagens do clipboard automaticamente |
| `goal-mode.ts` | Adiciona `/goal` para fixar done criteria até concluir ou limpar |
| `jina-reader.ts` | Lê URLs e PDFs via Jina Reader |
| `pi-tool-expert-helper.ts` | Helper para validação de tools/extensões |
| `plan-heavy.ts` | Harness `/plan-heavy` para handoff determinístico + validação de plano |
| `project-memory.ts` | Gerencia memória persistente por projeto |

### `/plan-heavy` — Planner Harness

Use para planejamento long-horizon/high-risk antes de builders. O harness cria um handoff determinístico com repo state, dirty files, hazards e checkpoint policy, depois orienta o uso do `planner-heavy`.

```txt
/plan-heavy <goal>                         # cria .pi/plans/<slug>/HANDOFF.md + prompt para planner-heavy
/plan-heavy validate <plan-dir>            # valida PLAN_FULL/SCHEDULE/TASKS antes de rodar builders
/plan-heavy envelope <plan-dir> <task-id>  # cria EXECUTION_ENVELOPE para o builder da task
```

O mesmo harness também é exposto como **tools chamáveis pelo agente** (para orquestração autônoma, sem depender de slash command digitado por humano):

| Tool | Equivalente | Função |
|------|-------------|--------|
| `plan_heavy_handoff` | `/plan-heavy <goal>` | coleta repo state e cria `HANDOFF.md` + prompt do planner-heavy |
| `plan_heavy_validate` | `/plan-heavy validate` | valida o plano e escreve `PLAN_HEAVY_VALIDATION.md` |
| `plan_heavy_envelope` | `/plan-heavy envelope` | gera o `EXECUTION_ENVELOPE` da task |

Fluxo ensemble (5 fases):

1. **Handoff** — `/plan-heavy <goal>` (ou tool `plan_heavy_handoff`) coleta `git status`, commits, `.pi/plans`, dirty files e hazards; cria `HANDOFF.md` + `BRIEFS/` com `BRIEF_PROMPT.md` e `MERGE_PROMPT.md`.
2. **Briefs (paralelo)** — `plan-briefer` (GPT-5.5) e `plan-briefer-fable` (Claude Fable 5 high primário; fallback manual para Opus 4.8 se indisponível) rodam em paralelo, cada um afinado pro guia do seu modelo. Cada um escreve UM brief de estratégia/lógica/conhecimento (`BRIEFS/brief_gpt.md`, `BRIEFS/brief_fable.md`) — sem tasks, sem DAG.
3. **Merge** — `plan-brief-merger` (GPT-5.5 high) funde os dois em `BRIEFS/brief_merged.md`, reconciliando e marcando divergências.
4. **Plano** — `planner-heavy` (GPT-5.5 xhigh) lê `HANDOFF.md` + `brief_merged.md` e escreve `PLAN_FULL.md`, `SCHEDULE.md` e `TASKS/`.
5. **Gate/execução** — `/plan-heavy validate <plan-dir>` bloqueia plano sem snapshots/checkpoints/agents/patch boundaries/preservation; depois `/plan-heavy envelope <plan-dir> <task-id>` gera o runtime handoff de cada task; então os builders executam.

O merge acontece no nível de **brief (prosa/estratégia)**, fácil e seguro de fundir — nunca no nível de DAG/tasks. O `planner-heavy` continua dono do output estruturado e grounda tudo no repo (brief é guia, repo vence em divergência).

### `/goal` — Goal Mode

Use quando quiser que o agente mantenha um critério de pronto ativo entre turnos. O comportamento segue o modelo do Claude Code: depois de cada turno, um evaluator separado julga o transcript; se o objetivo ainda não estiver cumprido, a extensão enfileira outro turno automaticamente.

```txt
/goal <done criteria>   # ativa/substitui o objetivo e inicia um turno imediatamente
/goal status            # mostra objetivo, avaliações, continuações e último motivo
/goal continue          # força/enfileira continuação do objetivo
/goal clear             # desativa
```

Aliases para desativar: `/goal stop`, `/goal off`, `/goal reset`, `/goal none`, `/goal cancel`, `/goal done`.

Como funciona:

- Um objetivo ativo por sessão.
- O evaluator usa somente o provider `anthropic` configurado no PI, preferencialmente `anthropic/claude-opus-4-8`.
- Não usa OpenRouter e não faz fallback para modelos não-Claude.
- Se nenhum Claude/Anthropic autenticado estiver disponível, `/goal` não ativa e mostra erro.
- O evaluator não roda tools nem lê arquivos; ele julga apenas evidências já presentes no transcript.
- Se o evaluator retorna `met`, o goal é limpo automaticamente.
- Se retorna `not_met`, a extensão enfileira follow-up com o motivo.
- Se retorna `blocked`, a extensão para e aguarda usuário (`/goal continue` ou `/goal clear`).
- Limite de segurança: 20 continuações automáticas.

Observação: é o mais próximo do `/goal` do Claude Code dentro da API atual do PI: evaluator separado Anthropic/Claude + follow-up automático.

---

## 🎯 Roteamento Automático

O PI detecta automaticamente o que você quer e usa o agente correto:

| Intenção detectada | Agente | Exemplos |
|-------------------|--------|----------|
| Ler/analisar URL fornecida | `moonshot_fetch` / `jina_read` | "lê essa página", "resume esse PDF" |
| Pesquisa web ampla | `moonshot_search` | "pesquisa X", "quem é Y?" |
| Explorar código | `scout` | "como funciona X?" |
| Planejar feature | `planner` | "planeja a implementação de X" |
| Planejar quick fix | Pré-plano direto | "corrige X", "troca Y por Z" |
| Implementar | `builder` | "implementa X" |
| Validar código | `validator` | "valida esse PR" |
| Criar site/landing | `website-designer` | "cria um site para X", "builda landing page" |
| Polir/refinar site | `website-polisher` | "polish esse site", "refina o design" |
| Criar agente | `agent-expert` | "cria um agente pra X" |
| Problema no PI | `pi-steward` | "o PI errou" |

---

## 📊 Modelos de IA

| Modelo | Agentes | Temperatura |
|--------|---------|-------------|
| **GPT-5.5** | Modelo padrão local, Plan Briefer, Plan Brief Merger, agentes de website/copy | xhigh/high |
| **Claude Fable 5** | Plan Briefer (Fable), Website Home Designer/Planner | high/xhigh |
| **GPT-5.3 Codex Spark** | Builder Highspeed, Scout Highspeed | medium |
| **GPT-5.4 mini** | Scout, Validator, Website Polisher, Deep Research Auditor/Finalizer | high |
| **Claude Sonnet 5** | Builder | medium |
| **Claude Opus** | Planner; fallback manual do plan-briefer-fable | xhigh |
| **inherit** | Agent Expert, Pi Steward (herdam do contexto) | 0.1 |

> Temperature 0.1 = determinístico, ideal para código. Baixa criatividade, máxima reprodutibilidade.

---

## 🗂️ Estrutura

```
Pi/
├── install.sh              # Script de instalação
├── config/
│   ├── settings.json       # Provider, modelo, packages
│   ├── SYSTEM.md           # System prompt customizado
│   ├── AGENTS.md           # Regras de roteamento dos agentes
│   └── mcp.json            # Configuração dos MCP servers
├── agents/                 # 26 agentes (.md)
│   ├── planner.md          # Arquiteto/Planejador
│   ├── planner-heavy.md    # Core limpo para /plan-heavy
│   ├── builder.md          # Engenheiro de execução cauteloso
│   ├── builder-highspeed.md # Executor rápido GPT-5.3 Codex Spark
│   ├── builder-heavy.md    # Executor robusto GPT-5.5 medium
│   ├── scout.md            # Explorador cauteloso
│   ├── scout-highspeed.md  # Explorador rápido GPT-5.3 Codex Spark
│   ├── validator.md        # Quality gate
│   ├── website-designer.md # Designer de websites
│   ├── website-home-designer.md # Designer de Home preview
│   ├── website-home-planner.md # Planner de Home preview
│   ├── website-polisher.md # UI/UX polish
│   ├── agent-expert.md     # Meta-agente para criar agentes
│   ├── pi-steward.md       # Canal de feedback/bugs
│   ├── deep-search-master.md  # Orquestrador de pesquisa
│   └── deep-research-*.md # Sub-agentes de pesquisa
├── skills/                 # skills globais
│   ├── agent-guide/
│   ├── builder/
│   ├── design-catalog/
│   ├── design-extractor/
│   ├── git-research/
│   ├── pi-tool-expert/
│   ├── planner/
│   ├── project-memory/
│   ├── scout/
│   ├── website-home-preview/
│   ├── website-pipeline/
│   └── website-stack/
└── extensions/             # 3 extensões (.ts)
    ├── auto-image-clipboard.ts
    ├── jina-reader.ts
    └── pi-tool-expert-helper.ts
```

---

## ⚠️ Troubleshooting

### "EACCES: permission denied" ao abrir o PI

Se ao rodar `pi` no terminal você recebe:
```
npm error EACCES: permission denied, mkdir '/usr/local/lib/node_modules/pi-mcp-adapter'
```

**Causa:** O npm global está configurado para `/usr/local/lib/node_modules/` e você não tem permissão de escrita lá.

**Solução:**
```bash
# Altera o prefix do npm para um diretório onde você tem permissão
npm config set prefix ~/npm-global
npm config set globalconfig ~/npm-global/etc/npmrc

# Depois tente novamente
pi
```

---

## 🚀 Capacidades em Resumo

1. **💬 Conversa natural** — Fale normalmente, ele detecta a intenção e age
2. **🔍 Explora código** — Mapeia arquivos, dependências, padrões instantaneamente
3. **📐 Planeja** — Cria planos detalhados para features complexas
4. **🔨 Implementa** — Executa com disciplina (git isolado, checklists, verificação)
5. **🛡️ Valida** — Quality gate com testes, segurança, arquitetura
6. **🔎 Pesquisa web** — De busca rápida até due diligence com 7 sub-agentes
7. **📄 Lê páginas/PDFs** — Extrai conteúdo de URLs, docs, READMEs
8. **🖼️ Processa imagens** — Analisa prints, screenshots, diagramas
9. **🧠 Tem memória** — Via SynaBun (memória vetorial) e Memory MCP
10. **🚨 Se auto-regula** — Detecta erros próprios e cria issues via Pi Steward
11. **🔌 Extensível** — Skills, extensões TypeScript, MCP servers, pacotes npm
12. **👁️ Integrado ao VS Code** — Diagnósticos, hover, definições, formatação em tempo real
