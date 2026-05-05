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

## 🤖 Agentes Disponíveis (16)

### Pipeline de Código

| Agente | Emoji | Função | Modelo | Quando usar |
|--------|-------|--------|--------|-------------|
| **Scout** | 🔍 | Explorador de código — mapeia arquivos, dependências, padrões, testes | MiniMax-M2.7 (barato/rápido) | "como funciona X?", "mapeia os endpoints", "onde está auth?" |
| **Planner** | 🏛️ | Arquiteto — cria planos ultra-detalhados para features, refactors, bug fixes | Kimi (modelo caro, thinking extended) | "planeja X", "desenha arquitetura de Y", "como refatorar Z?" |
| **Builder** | 🔨 | Engenheiro de execução — implementa com disciplina Git-first, checklists, verificação final | MiniMax-M2.7 | "implementa X", "executa esse plano", "builda a feature" |
| **Validator** | 🛡️ | Quality gate — valida testes, segurança, arquitetura. Pode gerar testes e BLOQUEIA código ruim | MiniMax-M2.7 | "valida esse PR", "audita os testes", "code review" |
| **Website Designer** | 🎨 | Designer de websites — analisa briefings, referencia marcas reais (Stripe, Apple, Linear, etc.) e produz DESIGN_PLAN.md detalhado | MiniMax-M2.7 | "cria um site para X", "builda uma landing page", "faz um site institucional" |
| **Website Polisher** | ✨ | UI/UX Engineer — audit final, refina shadows/borders/gradients, estados (hover, focus, disabled, loading, error), acessibilidade, polish completo | MiniMax-M2.7 | "polish esse site", "refina o design", "melhora a UX" |

### Pipeline Natural

Para mudanças não-triviais:

```
Scout → mapeia codebase (inteligência rápida)
  ↓
Planner → gera plano detalhado (plans/*.md)
  ↓
Builder → executa plano (branch isolada, TILL-DO → TODO → Final Verification)
  ↓
Validator → quality gate (testes, segurança, arquitetura)
```

**Quando pular etapas:**
- Tarefa trivial (mudar texto, CSS) → faça direto, sem agentes
- Tarefa média sem plano formal → `builder` direto
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

### Pesquisa Web — Deep Search Master

Orquestrador de pesquisa com 3 modos e 7 sub-agentes:

#### Modos de Operação

| Modo | Gatilho no prompt | Descrição | Confirmação? |
|------|-------------------|-----------|-------------|
| **Quick** | `quick:` | Busca rápida e direta | ❌ Vai direto |
| **Verify** | `verify:` | Validação de claims/dados | ❌ Vai direto |
| **Deep Search** | `deep search:` | Due diligence completa 4 fases | ✅ Planeja primeiro |

#### Sub-agentes de Pesquisa

| Sub-agente | Função |
|------------|--------|
| **Explorer** | Tendências emergentes, fontes não-convencionais, sinais antecipados |
| **Methodical** | Fundações acadêmicas, contexto histórico, frameworks, fontes primárias |
| **Skeptical** | Verifica claims, exige evidência, checa estatísticas |
| **Creative** | Conexões inesperadas, ângulos novos, insights cross-domain |
| **Critical** | Fraquezas, críticas, contradições, red flags |
| **Auditor** | Red team — analisa findings, detecta contradições entre agentes |
| **Finalizer** | Consolida tudo e escreve relatório final com citações |

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

### MCP Servers (7)

| Server | Ferramentas | Função |
|--------|-------------|--------|
| **SynaBun** | 76 tools | Memória vetorial persistente |
| **minimax-web-search** | 2 tools | Busca web + análise de imagens |
| **context7** | 2 tools | Documentação de bibliotecas |
| **zai-web-reader** | 1 tool | Leitura de páginas web |
| **zai-zread** | 3 tools | Leitura avançada de conteúdo |
| **zai-web-search-prime** | 1 tool | Busca web alternativa |
| **memory** | 9 tools | Memória/conhecimento persistente |

Para adicionar API keys nos MCP servers, basta pedir no chat do PI. Ele edita o `mcp.json` pra você.

---

## 📦 Skills (5)

| Skill | O que faz |
|-------|-----------|
| `git-research` | Clona repos temporariamente para pesquisa com cleanup automático |
| `mcp-vision` | Processa imagens via MCP quando o modelo não suporta vision |
| `pi-tool-expert` | Guia completo para criar/modificar extensões TypeScript do PI |
| `synabun` | Regras de uso da memória vetorial SynaBun |
| `design-catalog` | Catálogo de 73 design systems reais (Stripe, Linear, Apple, Vercel, Figma, etc.) com tokens, cores, tipografia e padrões visuais para referência em website design |

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
| Pesquisar algo | `deep-search-master` (quick) | "pesquisa X", "quem é Y?" |
| Verificar dados | `deep-search-master` (verify) | "verifica se X é verdade" |
| Pesquisa profunda | `deep-search-master` (deep) | "due diligence de X" |
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
| **MiniMax-M2.7-highspeed** | Scout, Builder, Validator, Deep Research (exceto auditor/finalizer) | 0.1 |
| **Kimi for Coding** | Planner, Deep Research Auditor, Deep Research Finalizer | 0.1 |
| **inherit** | Agent Expert, Pi Steward (herdam do contexto) | 0.1 |
| **GLM-5.1** (ZAI) | Modelo padrão do PI | — |

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
├── agents/                 # 16 agentes (.md)
│   ├── planner.md          # Arquiteto/Planejador
│   ├── planner-quick.md    # Planner leve para quick fixes
│   ├── builder.md          # Engenheiro de execução
│   ├── scout.md            # Explorador de código
│   ├── validator.md        # Quality gate
│   ├── website-designer.md # Designer de websites
│   ├── website-polisher.md # UI/UX polish
│   ├── agent-expert.md     # Meta-agente para criar agentes
│   ├── pi-steward.md       # Canal de feedback/bugs
│   ├── deep-search-master.md  # Orquestrador de pesquisa
│   └── deep-research-*.md # 7 sub-agentes de pesquisa
├── skills/                 # 5 skills
│   ├── git-research/
│   ├── mcp-vision/
│   ├── pi-tool-expert/
│   ├── synabun/
│   └── design-catalog/     # 73 design systems reais
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
