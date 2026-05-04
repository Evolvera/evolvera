# Relatório de Pesquisa: Customização do PI Coding Agent

**Tema:** Customização do tema visual e configurações do PI Coding Agent
**Data:** 2026-05-02
**Repositório:** [badlogic/pi-mono](https://github.com/badlogic/pi-mono) (mantido por `badlogic` / mario@badlogicgames.com)
**Pacote NPM:** `[@mariozechner/pi-coding-agent](https://www.npmjs.com/package/@mariozechner/pi-coding-agent)` v0.72.1 (MIT)

---

## Sumário Executivo

O PI Coding Agent é um harness CLI minimalista de coding agent feito em TypeScript, projetado para ser pequeno no núcleo e extensível via extensões TypeScript, skills, prompt templates, temas e packages. A customização é profunda e bem documentada — cobrimos aqui todos os vetores de personalização disponíveis.

---

## 1. Temas Visuais (Dark/Light/Custom)

### Temas Nativos

O PI possui dois temas built-in:

- `dark` — Tema escuro padrão (carregado por padrão se o terminal detectar fundo escuro)
- `light` — Tema claro

Os arquivos nativos ficam em:
```
packages/coding-agent/src/modes/interactive/theme/dark.json
packages/coding-agent/src/modes/interactive/theme/light.json
```

### Trocar Tema

**Via `/settings`** (modo interativo):
```
/settings  →  theme → escolher tema
```

**Via `settings.json`**:
```json
{
  "theme": "dark"
}
```
ou
```json
{
  "theme": "my-custom-theme"
}
```

**Via CLI flag**:
```bash
pi --theme ~/.pi/agent/themes/my-theme.json
```

### Temas Customizados — Criação

1. **Criar o arquivo de tema:**
```bash
mkdir -p ~/.pi/agent/themes
vim ~/.pi/agent/themes/meu-tema.json
```

2. **Formato do tema** (todos os 51 tokens são obrigatórios):

```json
{
  "$schema": "https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/src/modes/interactive/theme/theme-schema.json",
  "name": "meu-tema",
  "vars": {
    "primary": "#00aaff",
    "gray": 242
  },
  "colors": {
    "accent": "primary",
    "border": "primary",
    "borderAccent": "#00ffff",
    "borderMuted": "gray",
    "success": "#00ff00",
    "error": "#ff0000",
    "warning": "#ffff00",
    "muted": "gray",
    "dim": 240,
    "text": "",
    "thinkingText": "gray",
    "selectedBg": "#2d2d30",
    "userMessageBg": "#2d2d30",
    "userMessageText": "",
    "customMessageBg": "#2d2d30",
    "customMessageText": "",
    "customMessageLabel": "primary",
    "toolPendingBg": "#1e1e2e",
    "toolSuccessBg": "#1e2e1e",
    "toolErrorBg": "#2e1e1e",
    "toolTitle": "primary",
    "toolOutput": "",
    "mdHeading": "#ffaa00",
    "mdLink": "primary",
    "mdLinkUrl": "gray",
    "mdCode": "#00ffff",
    "mdCodeBlock": "",
    "mdCodeBlockBorder": "gray",
    "mdQuote": "gray",
    "mdQuoteBorder": "gray",
    "mdHr": "gray",
    "mdListBullet": "#00ffff",
    "toolDiffAdded": "#00ff00",
    "toolDiffRemoved": "#ff0000",
    "toolDiffContext": "gray",
    "syntaxComment": "gray",
    "syntaxKeyword": "primary",
    "syntaxFunction": "#00aaff",
    "syntaxVariable": "#ffaa00",
    "syntaxString": "#00ff00",
    "syntaxNumber": "#ff00ff",
    "syntaxType": "#00aaff",
    "syntaxOperator": "primary",
    "syntaxPunctuation": "gray",
    "thinkingOff": "gray",
    "thinkingMinimal": "#6e6e6e",
    "thinkingLow": "#5f87af",
    "thinkingMedium": "#81a2be",
    "thinkingHigh": "#b294bb",
    "thinkingXhigh": "#d183e8",
    "bashMode": "#ffaa00"
  }
}
```

### Sistema de Cores — 4 Formatos Suportados

| Formato | Exemplo | Descrição |
|---------|---------|-----------|
| Hex RGB | `"#ff0000"` | Cor RGB de 6 dígitos |
| Paleta 256 | `39` | Índice da paleta xterm (0-255) |
| Variável | `"primary"` | Referência a entrada em `vars` |
| Default | `""` | Cor padrão do terminal |

**Hot reload:** Edições no tema ativo são recarregadas automaticamente para feedback visual imediato.

### Temas da Comunidade

- **[pi-rose-pine](https://github.com/zenobi-us/pi-rose-pine)** — Três variantes (Main, Moon, Dawn) baseadas no [Rose Pine](https://rosepinetheme.com/). Instalar via:
  ```bash
  pi install @zenobius/pi-rose-pine
  ```
  Oferece: Rose Pine (original), Rose Pine Moon (contraste mais profundo), Rose Pine Dawn (variante clara).

---

## 2. Estrutura de Configuração Geral

### Arquivos de Configuração

| Local | Escopo |
|-------|--------|
| `~/.pi/agent/settings.json` | Global (todos os projetos) |
| `.pi/settings.json` | Projeto (diretório atual) |

Configurações de projeto sobrepõem as globais. Objetos aninhados são mesclados (não substituídos).

### Configurações de UI e Exibição

| Setting | Tipo | Padrão | Descrição |
|---------|------|--------|-----------|
| `theme` | string | `"dark"` | Nome do tema |
| `quietStartup` | boolean | `false` | Oculta header de startup |
| `collapseChangelog` | boolean | `false` | Mostra changelog condensado após updates |
| `doubleEscapeAction` | string | `"tree"` | Ação para duplo-escape: `"tree"`, `"fork"`, `"none"` |
| `editorPaddingX` | number | `0` | Padding horizontal do editor (0-3) |
| `autocompleteMaxVisible` | number | `5` | Itens visíveis no autocomplete (3-20) |
| `showHardwareCursor` | boolean | `false` | Mostra cursor do terminal |
| `terminal.showImages` | boolean | `true` | Mostra imagens no terminal |
| `terminal.imageWidthCells` | number | `60` | Largura de imagens inline |
| `markdown.codeBlockIndent` | string | `"  "` | Indentação de code blocks |

### Configurações de Tema e Cores — `settings.json`

```json
{
  "theme": "dark",
  "quietStartup": false,
  "collapseChangelog": false,
  "doubleEscapeAction": "tree",
  "editorPaddingX": 0,
  "autocompleteMaxVisible": 5,
  "showHardwareCursor": false,
  "terminal": {
    "showImages": true,
    "imageWidthCells": 60,
    "clearOnShrink": false
  },
  "images": {
    "autoResize": true,
    "blockImages": false
  }
}
```

---

## 3. Customização de Agentes, Prompts e Skills

### AGENTS.md — Instruções Globais

O PI carrega arquivos `AGENTS.md` (ou `CLAUDE.md`) de:
- `~/.pi/agent/AGENTS.md` — instruções globais
- Diretórios ancestrais, subindo a partir do cwd

Formato padrão Markdown com frontmatter opcional e regras para o agent seguir.

### Customização de Prompts via Extensões

Extensões podem modificar o system prompt via o evento `before_agent_start`:

```typescript
pi.on("before_agent_start", async (event, ctx) => {
  return {
    systemPrompt: event.systemPrompt + "\n\nExtra instructions...",
    message: {
      customType: "my-extension",
      content: "Additional context for the LLM",
      display: true,
    },
  };
});
```

### Skills — Workflows Reutilizáveis

Skills são diretórios com `SKILL.md` que o agent carrega sob demanda.

**Locais de discovery:**
```
~/.pi/agent/skills/
~/.agents/skills/
.pi/skills/
.agents/skills/
```

**Formato SKILL.md:**
```markdown
---
name: my-skill
description: O que o skill faz e quando usar. Seja específico.
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

**Usar skills via comando:**
```bash
/skill:brave-search           # Carregar e executar
/skill:pdf-tools extract      # Com argumentos
```

**Descoberta de skills em settings:**
```json
{
  "skills": ["~/.claude/skills", "~/.codex/skills"],
  "enableSkillCommands": true
}
```

**Repositórios de skills:**
- [badlogic/pi-skills](https://github.com/badlogic/pi-skills) — Busca web, automação de browser, APIs Google
- [Anthropic Skills](https://github.com/anthropics/skills) — Processamento de documentos

### Prompt Templates

Arquivos Markdown em `~/.pi/agent/prompts/*.md` que expandem de comandos `/`.

```markdown
---
description: Review staged git changes
argument-hint: "<PR-URL>"
---
Review the staged changes (`git diff --cached`). Focus on:
- Bugs and logic errors
- Security issues
```

Uso: `/review`, `/component Button "click handler"`

---

## 4. Extensões TypeScript (Plugin System)

O sistema de extensões é a forma mais poderosa de customização.

### Locais de Auto-descoberta

| Local | Escopo |
|-------|--------|
| `~/.pi/agent/extensions/*.ts` | Global |
| `.pi/extensions/*.ts` | Projeto |
| Pacotes npm/git com `extensions/` | Package |

### Exemplo de Extensão Mínima

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // Registrar ferramenta customizada
  pi.registerTool({
    name: "greet",
    label: "Greet",
    description: "Greet someone by name",
    parameters: Type.Object({
      name: Type.String({ description: "Name to greet" }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return {
        content: [{ type: "text", text: `Hello, ${params.name}!` }],
        details: {},
      };
    },
  });

  // Registrar comando customizado
  pi.registerCommand("hello", {
    description: "Say hello",
    handler: async (args, ctx) => {
      ctx.ui.notify(`Hello ${args || "world"}!`, "info");
    },
  });

  // Reagir a eventos
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("Extension loaded!", "info");
  });

  // Interceptar tool calls
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash" && event.input.command?.includes("rm -rf")) {
      const ok = await ctx.ui.confirm("Dangerous!", "Allow rm -rf?");
      if (!ok) return { block: true, reason: "Blocked by user" };
    }
  });
}
```

### Eventos de Extensão Principais

| Evento | Descrição |
|--------|-----------|
| `session_start` | Sessão iniciada/carregada |
| `session_shutdown` | Extension runtime destruída |
| `before_agent_start` | Antes do loop do agent — pode injetar mensagens e modificar system prompt |
| `agent_start` / `agent_end` | Início/fim de cada prompt do usuário |
| `tool_call` | Antes de ferramenta executar — **pode bloquear** |
| `tool_result` | Após execução — pode modificar resultado |
| `message_start` / `message_update` / `message_end` | Ciclo de vida de mensagens |
| `model_select` | Quando modelo muda |
| `input` | Input do usuário recebido — pode interceptar/transformar |
| `session_compact` | Durante compactação de contexto |
| `session_tree` | Durante navegação na árvore de sessão |

### Extensões de UI Customizada

```typescript
// UI customizada via ctx.ui
ctx.ui.notify("Message!", "info");          // Notificação
ctx.ui.confirm("Title", "Are you sure?");   // Confirmação
ctx.ui.select("Pick:", options);            // Seleção
ctx.ui.input("Enter:", "default");          // Input
ctx.ui.setStatus("my-ext", "Processing..."); // Status no footer
ctx.ui.setWidget("my-ext", ["Line 1"]);    // Widget acima do editor
```

Para componentes TUI complexos com keyboard input:
```typescript
ctx.ui.custom(component => {
  // Componente TUI completo
});
```

### Extensões da Comunidade (Lista Curada)

Baseado em [awesome-pi-agent](https://github.com/qualisero/awesome-pi-agent):

**UI e Visual:**
- [pi-rose-pine](https://github.com/zenobi-us/pi-rose-pine) — Temas Rose Pine (main, moon, dawn)
- [pi-gui](https://github.com/VVander/pi-gui) — GUI visual para o agent
- [pi-canvas](https://github.com/jyaunches/pi-canvas) — Canvass TUI interativos (calendário, documentos)
- [pi-cost-dashboard](https://github.com/mrexodia/pi-cost-dashboard) — Dashboard web para custos de API
- [shitty-extensions/usage-bar](https://github.com/hjanuschka/shitty-extensions) — Estatísticas de uso com polling
- [shitty-extensions/ultrathink](https://github.com/hjanuschka/shitty-extensions) — Efeito rainbow animado com Knight Rider shimmer

**Ferramentas e Produtividade:**
- [pi-extensions](https://github.com/richardgill/pi-extensions) — Browse files, skill-task routing, task-tool
- [pi-extensions](https://github.com/aliou/pi-extensions) — Debug, meta operations, process management
- [pi-notify-pp](https://github.com/kim0/pi-notify-pp) — Notificações ricas com stats de tools e OSC 777
- [pi-powerline-footer](https://github.com/nicobailon/pi-powerline-footer) — Status bar estilo powerline com git
- [pi-ssh-remote](https://github.com/cv/pi-ssh-remote) — Redireciona operações de arquivo via SSH

**Comportamento de Agente:**
- [pi-hooks](https://github.com/prateekmedia/pi-hooks) — Checkpoint git, LSP integration, permission layers
- [pi-dcp](https://github.com/zenobi-us/pi-dcp) — Dynamic context pruning para otimização
- [michalvavra/agents/security](https://github.com/michalvavra/agents) — Bloquear comandos bash perigosos
- [pi-sub](https://github.com/marckrenn/pi-sub) — Tracking de uso com widget UI

**Custom Provider / Model:**
- [pi-acp](https://github.com/svkozak/pi-acp) — Adaptador ACP
- [pi-synthetic](https://github.com/aliou/pi-synthetic) — Provider para models open-source via API Anthropic-compatible

---

## 5. Pi Packages — Distribuição de Customizações

Pacotes Pi permitem compartilhar extensões, skills, prompts e temas via npm ou git.

### Instalar/Remover Pacotes

```bash
pi install npm:@foo/bar@1.0.0
pi install git:github.com/user/repo@v1
pi install git:git@github.com:user/repo
pi install https://github.com/user/repo
pi install /path/to/local/package

pi remove npm:@foo/bar

pi list                          # Mostrar pacotes instalados
pi update                        # Atualizar pi e todos os pacotes
pi update --extensions           # Atualizar só pacotes
pi update --self                 # Atualizar só o pi
```

### Criar um Pi Package

```json
{
  "name": "my-package",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}
```

### Filtrar Recursos de Pacotes

```json
{
  "packages": [
    {
      "source": "npm:my-package",
      "extensions": ["extensions/*.ts", "!extensions/legacy.ts"],
      "skills": [],
      "prompts": ["prompts/review.md"],
      "themes": ["+themes/legacy.json"]
    }
  ]
}
```

---

## 6. Configuração de Keybindings

Arquivo: `~/.pi/agent/keybindings.json`

```json
{
  "tui.editor.cursorUp": ["up", "ctrl+p"],
  "tui.editor.cursorDown": ["down", "ctrl+n"],
  "app.model.select": ["ctrl+l"],
  "app.tools.expand": ["ctrl+o"]
}
```

**Exemplo Emacs:**
```json
{
  "tui.editor.cursorUp": ["up", "ctrl+p"],
  "tui.editor.cursorDown": ["down", "ctrl+n"],
  "tui.editor.cursorLeft": ["left", "ctrl+b"],
  "tui.editor.cursorRight": ["right", "ctrl+f"]
}
```

**Exemplo Vim:**
```json
{
  "tui.editor.cursorUp": ["up", "alt+k"],
  "tui.editor.cursorDown": ["down", "alt+j"],
  "tui.editor.cursorLeft": ["left", "alt+h"],
  "tui.editor.cursorRight": ["right", "alt+l"]
}
```

Após editar, usar `/reload` para aplicar sem reiniciar.

---

## 7. Providers e Modelos

### Providers Built-in

| Provider | Credential |
|----------|-----------|
| Anthropic | `ANTHROPIC_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Google Gemini | `GEMINI_API_KEY` |
| Azure OpenAI | `AZURE_OPENAI_API_KEY` |
| DeepSeek | `DEEPSEEK_API_KEY` |
| Mistral | `MISTRAL_API_KEY` |
| Groq | `GROQ_API_KEY` |
| Cerebras | `CEREBRAS_API_KEY` |

### Custom Provider via Extensão

```typescript
pi.registerProvider("my-provider", {
  name: "My Provider",
  baseUrl: "https://api.example.com",
  apiKey: "MY_API_KEY",
  api: "openai-completions",
  models: [{
    id: "my-model",
    name: "My Model",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096
  }]
});
```

---

## 8. Configuração Completa de Exemplo

### `~/.pi/agent/settings.json` — Configuração Global

```json
{
  "lastChangelogVersion": "0.72.1",
  "defaultProvider": "anthropic",
  "defaultModel": "claude-sonnet-4-20250514",
  "defaultThinkingLevel": "medium",
  "theme": "dark",
  "hideThinkingBlock": false,
  "quietStartup": false,
  "collapseChangelog": false,
  "doubleEscapeAction": "tree",
  "editorPaddingX": 0,
  "autocompleteMaxVisible": 5,
  "showHardwareCursor": false,
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  },
  "retry": {
    "enabled": true,
    "maxRetries": 3,
    "baseDelayMs": 2000,
    "provider": {
      "timeoutMs": 3600000,
      "maxRetries": 0,
      "maxRetryDelayMs": 60000
    }
  },
  "packages": [
    "git:github.com/HazAT/pi-interactive-subagents",
    "git:github.com/badlogic/pi-diff-review"
  ],
  "skills": [],
  "themes": [],
  "extensions": []
}
```

### `~/.pi/agent/AGENTS.md` — Exemplo

```markdown
# Project Rules

## Coding Style
- Use TypeScript strict mode
- Prefer explicit types over `any`
- Use `const` over `let`

## Git
- Write conventional commits
- Never force push to main

## Code Review
- Check for security vulnerabilities
- Verify error handling
```

---

## 9. Arquitetura de Diretórios

```
~/.pi/
└── agent/
    ├── settings.json          # Configurações globais
    ├── keybindings.json      # Atalhos de teclado customizados
    ├── auth.json              # API keys (não versionar!)
    ├── AGENTS.md             # Instruções globais para o agent
    ├── sessions/             # Arquivos de sessão (.jsonl)
    ├── extensions/           # Extensões TypeScript globais
    │   └── my-extension.ts
    ├── skills/               # Skills globais
    │   └── my-skill/
    │       └── SKILL.md
    ├── prompts/              # Prompt templates globais
    │   └── review.md
    ├── themes/               # Temas customizados
    │   └── meu-tema.json
    └── git/                  # Pacotes git clonados
        └── github.com/
            └── user/
                └── repo/
```

---

## 10. Fontes e Documentação

### Repositórios Principais

| Repo | Descrição |
|------|-----------|
| [badlogic/pi-mono](https://github.com/badlogic/pi-mono) | Monorepo oficial — todo o código fonte |
| [badlogic/pi-skills](https://github.com/badlogic/pi-skills) | Skills oficiais (brave-search, browser-tools, etc.) |
| [qualisero/awesome-pi-agent](https://github.com/qualisero/awesome-pi-agent) | Lista curada de extensões e recursos |
| [zenobi-us/pi-rose-pine](https://github.com/zenobi-us/pi-rose-pine) | Temas Rose Pine |

### Documentação Integrada (em `packages/coding-agent/docs/`)

| Arquivo | Conteúdo |
|---------|----------|
| `index.md` | Visão geral e links para todos os docs |
| `quickstart.md` | Instalação e primeiro uso |
| `usage.md` | Modo interativo, slash commands, context files |
| `providers.md` | Setup de providers (OAuth + API keys) |
| `settings.md` | Todas as configurações disponíveis |
| `keybindings.md` | Atalhos e customização |
| `themes.md` | **Guia completo de temas** |
| `extensions.md` | **Guia completo de extensões TypeScript** |
| `skills.md` | Sistema de skills |
| `prompt-templates.md` | Templates de prompt |
| `packages.md` | Pi packages (distribuição) |
| `sessions.md` | Gerenciamento de sessões |
| `compaction.md` | Context compaction |
| `models.md` | Registro de modelos customizados |
| `custom-provider.md` | Providers customizados |
| `sdk.md` | Uso programático |
| `rpc.md` | Modo RPC (stdin/stdout JSONL) |
| `session-format.md` | Formato JSONL das sessões |
| `tui.md` | Componentes TUI para extensões |

### Configurações de Exemplo da Comunidade

- [HazAT/pi-config](https://github.com/HazAT/pi-config) — Config pessoal completa com subagents, skills, extensions
- [aliou/pi-harness](https://github.com/aliou/pi-harness) — Setup multi-model com tools e prompts

---

## 11. Resumo — Caminhos de Customização

| Nível | O Quê | Como |
|-------|-------|------|
| **Visual** | Tema escuro/claro | `settings.json` → `theme` ou `/settings` |
| **Visual** | Tema customizado | Criar JSON em `~/.pi/agent/themes/` |
| **Visual** | Keybindings | `~/.pi/agent/keybindings.json` |
| **UI** | Extensões TypeScript | `~/.pi/agent/extensions/*.ts` |
| **UI** | Comandos customizados | `pi.registerCommand()` em extensão |
| **UI** | Widgets no footer | `ctx.ui.setStatus()`, `ctx.ui.setWidget()` |
| **Comportamento** | Skills | `~/.pi/agent/skills/` |
| **Comportamento** | Prompt templates | `~/.pi/agent/prompts/*.md` |
| **Comportamento** | System prompt | `before_agent_start` event em extensão |
| **Comportamento** | Instruções do agent | `~/.pi/agent/AGENTS.md` |
| **Comportamento** | Permissões/gates | `tool_call` event com `block: true` |
| **Sistema** | Packages | `pi install npm:...` ou `git:...` |
| **Sistema** | Providers customizados | `pi.registerProvider()` em extensão |
| **Sistema** | Modelos customizados | `models.json` + `pi.registerProvider()` |
| **Sistema** | Config global | `~/.pi/agent/settings.json` |

---

*Pesquisa concluída em 2026-05-02. Fontes: repositórios GitHub, documentação integrada, NPM package, awesome-pi-agent community list.*
