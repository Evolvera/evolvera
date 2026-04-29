# Evolvera PI Setup

Configuração padronizada do [PI Coding Agent](https://github.com/badlogic/pi) para o time.

## Instalação

```bash
# 1. Clone o repo
git clone git@github.com:Evolvera/Pi.git
cd Pi

# 2. Rode o install
./install.sh
```

O script pergunta as API keys na primeira vez. Nas vezes seguintes ele preserva suas keys.

## Atualizar

```bash
cd Pi
git pull
./install.sh
```

## Pré-requisitos

- Node.js 20+
- npm
- uvx (para Minimax MCP) — `pip install uvx`
- Acesso ao repo (privado)

## O que é instalado

### Agents (13)

| Agente | O que faz |
|--------|-----------|
| `planner` | Arquiteta features, gera planos detalhados em `plans/*.md` |
| `builder` | Executa implementações com Git-first, checklists, verificação final |
| `scout` | Explora e mapeia o codebase rápido (modelo barato) |
| `validator` | Quality gate — testa, audita, bloqueia código ruim |
| `deep-search-master` | Pesquisa web. Modos: `quick:`, `verify:`, `deep search:` |
| `deep-research-*` (7 agentes) | Pipeline de pesquisa profunda (auditor, creative, critical, explorer, finalizer, methodical, skeptical) |
| `agent-expert` | Cria e configura novos agentes do PI |

### Skills (4)

| Skill | O que faz |
|-------|-----------|
| `git-research` | Clona repos temporariamente para pesquisa |
| `mcp-vision` | Processa imagens via MCP |
| `pi-tool-expert` | Cria tools, extensões e skills para o PI |
| `synabun` | Memória vetorial persistente via MCP |

### Extensions (3)

| Extensão | O que faz |
|----------|-----------|
| `auto-image-clipboard.ts` | Processa imagens do clipboard |
| `jina-reader.ts` | Lê URLs e PDFs via Jina |
| `pi-tool-expert-helper.ts` | Helper para criar ferramentas do PI |

### MCP Servers (7)

| Server | O que faz |
|--------|-----------|
| SynaBun | Memória vetorial local |
| memory | Memória persistente via MCP |
| context7 | Contexto de documentação |
| minimax-web-search | Busca na web |
| zai-web-reader | Leitura de páginas web |
| zai-zread | Leitura avançada de conteúdo |
| zai-web-search-prime | Busca web via Z.AI |

## Estrutura

```
Pi/
├── install.sh          # Script de instalação
├── config/
│   ├── settings.json   # Provider padrão, modelo, packages
│   ├── SYSTEM.md       # System prompt
│   ├── AGENTS.md       # Regras de roteamento dos agentes
│   └── mcp.json        # MCP servers (template, sem keys reais)
├── agents/             # 13 agentes (.md)
├── skills/             # 4 skills
└── extensions/         # 3 extensões (.ts)
```

## Pipeline de Código

Para mudanças não-triviais, o PI segue esta pipeline automaticamente:

```
scout → mapeia o codebase
  ↓
planner → gera plano detalhado
  ↓
builder → executa em branch isolada
  ↓
validator → quality gate final
```

Tarefas triviais (mudar texto, CSS) → PI faz direto, sem agentes.

## API Keys

As keys ficam em `~/.pi/agent/mcp.json` e não são commitadas.

Para trocar uma key, edite o arquivo diretamente:

```bash
nano ~/.pi/agent/mcp.json
```

Para resetar tudo e configurar de novo:

```bash
rm ~/.pi/agent/mcp.json
./install.sh
```
