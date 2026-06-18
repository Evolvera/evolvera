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

## 🤖 Agentes Disponíveis (18)

### Pipeline de Código

| Agente | Emoji | Função | Modelo | Quando usar |
|--------|-------|--------|--------|-------------|
| **Scout Highspeed** | ⚡ | Explorador rápido — mapeia arquivos, dependências, padrões, testes | GPT-5.3 Codex Spark | default para exploração rápida/backend/infra/algoritmos |
| **Scout** | 🔍 | Explorador cauteloso com workflow Kimi/checkpoint | Kimi for Coding | quando menor risco de alucinação importa mais que velocidade |
| **Planner** | 🏛️ | Arquiteto — cria planos ultra-detalhados para features, refactors, bug fixes | Claude Opus | "planeja X", "desenha arquitetura de Y", "como refatorar Z?" |
| **Builder Highspeed** | ⚡ | Executor rápido para single-file edits, protótipos, CSS/React tweaks, testes, tooling, backend, lógica/math | GPT-5.3 Codex Spark | usar em tarefas explícitas e verificáveis; evitar tarefas amplas e polish/design final |
| **Builder** | 🔨 | Executor cauteloso com disciplina Git-first, checklists, verificação final | Kimi for Coding | quando menor risco de alucinação importa mais que velocidade |
| **Validator** | 🛡️ | Quality gate — valida testes, segurança, arquitetura. Pode gerar testes e BLOQUEIA código ruim | Kimi for Coding | "valida esse PR", "audita os testes", "code review" |
| **Website Designer** | 🎨 | Designer de websites — analisa briefings, referencia marcas reais (Stripe, Apple, Linear, etc.) e produz DESIGN_PLAN.md detalhado | GPT-5.5 | "cria um site para X", "builda uma landing page", "faz um site institucional" |
| **Website Polisher** | ✨ | UI/UX Engineer — audit final, refina shadows/borders/gradients, estados (hover, focus, disabled, loading, error), acessibilidade, polish completo | Kimi for Coding | "polish esse site", "refina o design", "melhora a UX" |

### Pipeline Natural

Para mudanças não-triviais:

```
Scout Highspeed/Scout → mapeia codebase
  ↓
Planner → gera plano detalhado (plans/*.md)
  ↓
Builder Highspeed/Builder → executa plano
  ↓
Validator → quality gate (testes, segurança, arquitetura)
```

**Quando pular etapas:**
- Tarefa trivial (mudar texto, CSS) → faça direto, sem agentes
- Tarefa média sem plano formal → `builder-highspeed` direto quando explícita/single-file/module-local; `builder` quando cautela importa
- Mudança crítica (auth, payment, PII) → builder + validator automático
- Mudança muito extensa (>10 files) → pipeline completa

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
| **Planner Quick** | ⚡ | Planner leve para quick fixes e tarefas simples (1-5 arquivos, trocas de string) | "corrige os tool names", "troca X por Y" |

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
| `website-pipeline` | Orquestração design → conteúdo → plano → build |
| `website-stack` | Convenções de stack para websites |

## 🔌 Extensões (3)

| Extensão | O que faz |
|----------|-----------|
| `auto-image-clipboard.ts` | Captura imagens do clipboard automaticamente |
| `jina-reader.ts` | Lê URLs e PDFs via Jina Reader |
| `pi-tool-expert-helper.ts` | Helper para validação de tools/extensões |

---

## 🎯 Roteamento Automático

O PI detecta automaticamente o que você quer e usa o agente correto:

| Intenção detectada | Agente | Exemplos |
|-------------------|--------|----------|
| Ler/analisar URL fornecida | `moonshot_fetch` / `jina_read` | "lê essa página", "resume esse PDF" |
| Pesquisa web ampla | `moonshot_search` | "pesquisa X", "quem é Y?" |
| Explorar código | `scout` | "como funciona X?" |
| Planejar feature | `planner` | "planeja a implementação de X" |
| Planejar quick fix | `planner-quick` | "corrige X", "troca Y por Z" |
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
| **GPT-5.5** | Modelo padrão local e agentes de website/copy | xhigh |
| **GPT-5.3 Codex Spark** | Builder Highspeed, Scout Highspeed | medium |
| **Kimi for Coding** | Scout, Builder, Validator, Deep Research Auditor/Finalizer | 0.1 |
| **Claude Opus** | Planner | xhigh |
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
├── agents/                 # 18 agentes (.md)
│   ├── planner.md          # Arquiteto/Planejador
│   ├── planner-quick.md    # Planner leve para quick fixes
│   ├── builder.md          # Engenheiro de execução cauteloso
│   ├── builder-highspeed.md # Executor rápido GPT-5.3 Codex Spark
│   ├── scout.md            # Explorador cauteloso
│   ├── scout-highspeed.md  # Explorador rápido GPT-5.3 Codex Spark
│   ├── validator.md        # Quality gate
│   ├── website-designer.md # Designer de websites
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
