# Evolvera PI Setup

Configuração padronizada do [PI Coding Agent](https://github.com/badlogic/pi) para o time.

## Primeira instalação

### Pré-requisitos

- **Node.js 20+** — `node --version`
- **npm** — vem com Node
- **uvx** — `pip install uvx` (necessário para busca web)
- **python3** — para o install script fazer merge de configs
- **Acesso** a este repo (privado da org)

### Passo a passo

```bash
# 1. Clone
git clone git@github.com:Evolvera/Pi.git
cd Pi

# 2. Instala tudo
./install.sh
```

O install.sh vai:

1. Instalar o PI se não tiver
2. Copiar agents, skills, extensions e configs para `~/.pi/agent/`
3. Pedir suas **API keys** interativamente (só na primeira vez)
4. Configurar os MCP servers com suas keys
5. Instalar dependências (SynaBun, etc.)

### API Keys que você precisa

Cadastre-se e gere uma key em cada serviço:

| Serviço | Onde conseguir | Obrigatório? |
|---------|---------------|-------------|
| **Z.AI** | https://z.ai → Settings → API Keys | Sim |
| **Minimax** | https://minimax.io → Dashboard → API Keys | Sim |
| **Kimi** | https://platform.moonshot.cn → API Keys | Não (usado pelo planner) |

As keys ficam em `~/.pi/agent/auth.json` — **nunca** são commitadas.

### Modelo padrão

O setup usa **zai/glm-5.1** como modelo padrão. Para trocar:

```bash
# Dentro do PI, digite:
/model
```

Para trocar o padrão para todos, edite `config/settings.json` e commite.

### Depois de instalar

Abra um terminal e digite:

```
pi
```

## Atualizar

```bash
cd Pi
git pull
./install.sh
```

O script preserva suas API keys. Não sobrescreve `auth.json` nem `mcp.json` existentes.

Para forçar reconfiguração das keys:

```bash
rm ~/.pi/agent/auth.json ~/.pi/agent/mcp.json
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

| Server | O que faz | Precisa de key? |
|--------|-----------|----------------|
| SynaBun | Memória vetorial local | Não |
| memory | Memória persistente via MCP | Não |
| context7 | Contexto de documentação | Não |
| minimax-web-search | Busca na web | Sim (Minimax) |
| zai-web-reader | Leitura de páginas web | Sim (Z.AI) |
| zai-zread | Leitura avançada de conteúdo | Sim (Z.AI) |
| zai-web-search-prime | Busca web via Z.AI | Sim (Z.AI) |

## Pipeline de código

Para mudanças não-triviais, o PI segue esta pipeline:

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

## Estrutura do repo

```
Pi/
├── install.sh              # Script de instalação
├── config/
│   ├── settings.json       # Provider, modelo, packages
│   ├── SYSTEM.md           # System prompt
│   ├── AGENTS.md           # Regras de roteamento dos agentes
│   └── mcp.json            # Template dos MCP servers
├── agents/                 # 13 agentes (.md)
├── skills/                 # 4 skills
└── extensions/             # 3 extensões (.ts)
```

## Estrutura no disco do usuário

```
~/.pi/agent/
├── auth.json       # API keys (NÃO commitado)
├── mcp.json        # MCP servers com keys reais (NÃO commitado)
├── settings.json   # Config do PI
├── SYSTEM.md       # System prompt
├── AGENTS.md       # Regras de roteamento
├── agents/         # 13 agentes
├── skills/         # 4 skills
└── extensions/     # 3 extensões
```
