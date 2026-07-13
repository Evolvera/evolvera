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

## 🤖 Agentes Disponíveis (32)

### Pipeline de Código

| Agente | Emoji | Função | Modelo | Quando usar |
|--------|-------|--------|--------|-------------|
| **Scout Highspeed** | ⚡ | Explorador rápido para buscas estreitas | GPT-5.3 Codex Spark medium | micro-scouts mecânicos |
| **Scout** | 🔍 | Explorador cauteloso e coerente | GPT-5.6 Luna high | mapas amplos, evidência e síntese |
| **Planner** | 🏛️ | Gera PLAN_FULL/SCHEDULE e tasks compactas | GPT-5.6 Sol medium | planejamento normal complexo |
| **Planner Heavy** | 🏛️ | Core final do `/plan-heavy` | GPT-5.6 Sol xhigh | planos de alto risco |
| **Plan Briefer** | 🧩 | Brief estratégico GPT | GPT-5.6 Sol high | ensemble `/plan-heavy` |
| **Plan Briefer (Fable)** | 🧩 | Brief estratégico alternativo | Claude Fable 5 high | ensemble `/plan-heavy` |
| **Plan Brief Merger** | 🔗 | Reconcilia os dois briefs | GPT-5.6 Terra high | merge de estratégia |
| **Builder Highspeed** | ⚡ | Edições mecânicas e rápidas | GPT-5.3 Codex Spark xhigh | single-file/tooling/tests |
| **Builder** | 🔨 | Executor geral normal-risk | GPT-5.6 Luna xhigh | backend/tooling/testes/integração comum |
| **Builder Design** | 🎨 | Filho padrão do tier visual | Claude Fable 5 low | frontend/UI, layout, responsivo e polish |
| **Builder Heavy** | 🧠 | Integração/correção de alto risco | GPT-5.6 Sol medium | shared files, migrações, lógica/math |
| **Builder Heavy Design** | 🎞️ | Pai/escalonamento visual máximo | Claude Fable 5 high | motion avançado, 2D/3D, art direction |
| **Builder Home** | 🏗️ | Implementa uma Home Preview estática | MiniMax M3 high | somente `website-home-preview` |
| **Validator** | 🛡️ | Quality gate geral de código/PR | GPT-5.6 Terra medium | testes, segurança, arquitetura |
| **Validator Home** | 🏠🛡️ | Quality gate visual da Home Preview | MiniMax M3 high | somente `website-home-preview` |
| **Website Designer** | 🎨 | Produz DESIGN_PLAN de site completo | Claude Fable 5 medium | pipeline de website |
| **SEO Content Writer** | ✍️ | Produz CONTENT_PLAN de site completo | GPT-5.6 Sol medium | pipeline de website |
| **SEO Content Writer Home** | 🏠✍️ | Produz HOME_CONTENT_PLAN autônomo | GLM-5.2 high | somente `website-home-preview` |
| **Website Home Designer** | 🏠 | Direções visuais da Home Preview | GLM-5.2 high | somente `website-home-preview` |
| **Website Home Planner** | 🧭 | Seleciona direção e cria task Home | GLM-5.2 high | somente `website-home-preview` |
| **Website Polisher** | ✨ | Polish planner geral para sites | Claude Fable 5 low | site completo/existente |
| **Website Polisher Home** | 🏠✨ | Polish visual da Home Preview | MiniMax M3 high | somente `website-home-preview` |

### Pipeline Natural

Para mudanças não-triviais:

```
Scout Highspeed/Scout → mapeia codebase
  ↓
Planner → gera plano detalhado (plans/*.md)
  ↓
Builder Highspeed/Builder/Builder Design/Builder Heavy/Builder Heavy Design → executa plano
  ↓
Validator → quality gate (testes, segurança, arquitetura)
```

**Quando pular etapas:**
- Tarefa trivial (mudar texto, CSS) → faça direto, sem agentes
- Frontend/UI coding → `builder-light-design` para UI rotineira dentro do design system; `builder-design` quando exige julgamento visual; `builder-heavy-design` quando exceder o tier visual padrão
- Tarefa média sem plano formal → `builder-light` quando a mudança é localmente decidível (âncora clara, padrão existente, validação exata); `builder` quando exige raciocínio não-local; `builder-design` quando frontend/qualidade visual importa
- Tarefa correctness-sensitive/shared-file → `builder-heavy` + checkpoint/validator
- Mudança crítica (auth, payment, PII) → builder-heavy ou builder + validator automático
- Mudança muito extensa (>10 files) → pipeline completa

### Website Home Preview Chain

Fluxo autônomo para gerar uma Home Page premium em um único arquivo `index.html`:

```
website-home-designer → seo-content-writer-home → website-home-planner → builder-home → website-polisher-home → builder-home → validator-home
```

**Resultado:** `.pi/previews/<slug>/index.html`

Use quando quiser preview visual/copy de uma Home sem criar projeto completo, sem Next/Tailwind build, e sem human-in-the-loop. Os agentes `*-home` isolam MiniMax M3 e GLM-5.2 exclusivamente nesse fluxo.

### Website Building Chain

Fluxo completo para criar sites profissionais com referência em marcas reais:

```
website-designer → seo-content-writer → planner → builder-design → website-polisher → builder-design → validator
```

**Passos:**
1. **website-designer** — Analisa briefing, referencia design systems reais (Stripe, Linear, Apple, Vercel, Figma, etc.) e gera `DESIGN_PLAN.md`
2. **seo-content-writer** — Produz copy/SEO aprovada em `CONTENT_PLAN.md`
3. **planner** — Gera tarefas e roteamento
4. **builder-design** — Implementa o design no tier visual padrão
5. **website-polisher** — Gera `POLISH_PLAN.md`
6. **builder-design** — Aplica o polish
7. **validator** — Quality gate final

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
/plan-heavy <goal>                         # cria handoff + prompts dos briefers/merge/planner e inicia o ensemble
/plan-heavy validate <plan-dir>            # valida PLAN_FULL/SCHEDULE/TASKS antes de rodar builders
/plan-heavy envelope <plan-dir> <task-id>  # cria EXECUTION_ENVELOPE para o builder da task
```

O mesmo harness também é exposto como **tools chamáveis pelo agente** (para orquestração autônoma, sem depender de slash command digitado por humano):

| Tool | Equivalente | Função |
|------|-------------|--------|
| `plan_heavy_handoff` | `/plan-heavy <goal>` | coleta repo state e cria `HANDOFF.md` + prompts separados para briefers/planner |
| `plan_heavy_validate` | `/plan-heavy validate` | valida o plano e escreve `PLAN_HEAVY_VALIDATION.md` |
| `plan_heavy_envelope` | `/plan-heavy envelope` | gera o `EXECUTION_ENVELOPE` da task |

Fluxo ensemble (4 fases):

1. **Handoff** — `/plan-heavy <goal>` (ou tool `plan_heavy_handoff`, que exige `projectRoot` absoluto) coleta `git status`, commits, dirty files e hazards; cria `HANDOFF.md` + `BRIEFS/` com prompts separados dos briefers. O agente não deve parar aqui.
2. **Briefs (paralelo)** — `plan-briefer` (GPT-5.6 Sol high) e `plan-briefer-fable` (Claude Fable 5 high) rodam em paralelo, cada um afinado pro guia do seu modelo. Cada um escreve UM brief de estratégia/lógica/conhecimento (`BRIEFS/brief_gpt.md`, `BRIEFS/brief_fable.md`) — sem tasks, sem DAG.
3. **Plano** — `planner-heavy` (GPT-5.6 Sol xhigh) lê `HANDOFF.md` + os DOIS briefs, reconcilia divergências explicitamente no `PLAN_FULL.md` e escreve `SCHEDULE.md` e tasks compactas (normalmente 40–90 linhas; sem TODO/TILL-DO duplicado).
4. **Gate/execução** — `/plan-heavy validate <plan-dir>` aceita o contrato compacto e bloqueia ausência de agente/goal/change/acceptance/validation/checkpoint ou hazards concretos; `/plan-heavy envelope` adiciona o runtime state/recovery/checkpoint que não precisa ser repetido na task.

A reconciliação dos briefs acontece dentro do `planner-heavy` (xhigh), que é quem decide o output estruturado e grounda tudo no repo (brief é guia, repo vence em divergência).

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
| Implementar código geral | `builder` | "implementa X" |
| Implementar frontend/UI | `builder-design` | "implementa esse layout/design" |
| Validar código | `validator` | "valida esse PR" |
| Criar site/landing | `website-designer` | "cria um site para X", "builda landing page" |
| Polir/refinar site | `website-polisher` | "polish esse site", "refina o design" |
| Criar agente | `agent-expert` | "cria um agente pra X" |
| Problema no PI | `pi-steward` | "o PI errou" |

---

## 📊 Modelos de IA

| Modelo | Agentes | Reasoning effort |
|--------|---------|------------------|
| **GPT-5.6 Sol** | Planner (medium), Planner Heavy (xhigh), Plan Briefer (high), Builder Heavy (medium), SEO Content Writer (medium) | medium / high / xhigh |
| **GPT-5.6 Terra** | Plan Brief Merger, Validator | high / medium |
| **GPT-5.6 Luna** | Builder, Scout, Deep Research Auditor/Finalizer | xhigh / high |
| **GPT-5.5** | Agentes de Deep Research não migrados | medium / low |
| **Claude Fable 5** | Plan Briefer Fable, Builder Design, Builder Heavy Design, Website Designer, Website Polisher | high / medium / low |
| **GPT-5.3 Codex Spark** | Builder Highspeed, Scout Highspeed | xhigh / medium |
| **MiniMax M3** | Builder Home, Validator Home, Website Polisher Home | high |
| **GLM-5.2** | SEO Content Writer Home, Website Home Designer/Planner | high |
| **inherit** | Agent Expert, Pi Steward | herda modelo; effort explícito no agente |

> Reasoning effort (`thinking`: off/minimal/low/medium/high/xhigh) controla quanto o modelo raciocina antes de responder. Mais effort = mais profundidade e custo; menos effort = mais velocidade.

---

## 🗂️ Estrutura

```
Pi/
├── install.sh              # Script de instalação
├── config/
│   ├── settings.json       # Provider, modelo padrão, packages
│   ├── models.json         # GPT-5.6 custom entries + context overrides
│   ├── SYSTEM.md           # System prompt customizado
│   ├── AGENTS.md           # Regras de roteamento dos agentes
│   └── mcp.json            # Configuração dos MCP servers
├── agents/                 # 32 agentes (.md)
│   ├── planner.md          # GPT-5.6 Sol medium; tasks compactas
│   ├── planner-heavy.md    # GPT-5.6 Sol xhigh /plan-heavy
│   ├── builder.md          # Executor geral GPT-5.6 Luna xhigh
│   ├── builder-design.md   # Frontend/UI Claude Fable 5 low
│   ├── builder-heavy.md    # Correctness GPT-5.6 Sol medium
│   ├── builder-heavy-design.md # Visual máximo Claude Fable 5 high
│   ├── builder-home.md     # Home Preview MiniMax M3
│   ├── builder-light.md    # GPT-5.6 Luna medium
│   ├── builder-light-design.md # Claude Sonnet 5 medium
│   ├── scout.md            # GPT-5.6 Luna high
│   ├── scout-highspeed.md  # GPT-5.3 Codex Spark
│   ├── validator.md        # Geral GPT-5.6 Terra medium
│   ├── validator-home.md   # Home Preview MiniMax M3
│   ├── seo-content-writer.md # Site completo GPT-5.6 Sol medium
│   ├── seo-content-writer-home.md # Home Preview GLM-5.2
│   ├── website-designer.md # Designer de websites
│   ├── website-home-designer.md # Home Preview GLM-5.2
│   ├── website-home-planner.md # Home Preview GLM-5.2
│   ├── website-polisher.md # Geral Claude Fable 5 low
│   ├── website-polisher-home.md # Home Preview MiniMax M3
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
