# Evolvera PI Setup

Configuração padronizada do [PI Coding Agent](https://github.com/badlogic/pi) para o time.

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

O `/login` pede a API key e salva automaticamente. Pronto, já pode usar.

### VS Code

Instale a extensão [PI for VS Code](https://marketplace.visualstudio.com/items?itemName=pi0.pi-vscode) para usar o PI direto no editor.

## Atualizar

```bash
cd Pi
git pull
./install.sh
```

## O que vem instalado

### Agents (13)

| Agente | O que faz |
|--------|-----------|
| `planner` | Arquiteta features e gera planos detalhados |
| `builder` | Executa implementações com Git-first e verificação |
| `scout` | Explora e mapeia o codebase |
| `validator` | Quality gate — testa, audita, bloqueia código ruim |
| `deep-search-master` | Pesquisa web. Modos: `quick:`, `verify:`, `deep search:` |
| `deep-research-*` (7) | Pipeline de pesquisa profunda com múltiplos ângulos |
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

Para adicionar API keys nos MCP servers, basta pedir no chat do PI. Ele edita o `mcp.json` pra você.

## Pipeline de código

Para mudanças não-triviais:

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

## Estrutura

```
Pi/
├── install.sh          # Script de instalação
├── config/
│   ├── settings.json   # Provider, modelo, packages
│   ├── SYSTEM.md       # System prompt
│   ├── AGENTS.md       # Regras de roteamento dos agentes
│   └── mcp.json        # Referência dos MCP servers
├── agents/             # 13 agentes (.md)
├── skills/             # 4 skills
└── extensions/         # 3 extensões (.ts)
```
