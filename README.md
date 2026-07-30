# Evolvera PI

Harness padronizado do [PI Coding Agent](https://github.com/badlogic/pi) para trabalhar no terminal e no VS Code com agentes, skills, extensões e ferramentas compartilhadas pelo time.

O PI principal continua responsável pelo resultado. Ele lê o pedido e as regras do harness, decide entre agir diretamente ou delegar, coleta evidências do repositório, implementa a menor mudança suficiente e valida o resultado.

```text
Usuário
  → PI principal + SYSTEM.md
    → ação direta ou agente especializado
      → ferramentas / código / runtime
        → validação e resultado
```

## Início rápido

### Pré-requisitos

- Git;
- acesso ao repositório privado `Evolvera/evolvera`;
- GitHub CLI (`gh`) ou outro meio de clonar o repositório;
- Node.js `>=22.19.0`;
- npm disponível no `PATH`;
- credencial para pelo menos um provider de IA.

A baseline padrão instalada pelos scripts é `@earendil-works/pi-coding-agent@0.82.1`.

### Node com fnm (Linux e macOS)

Antes de executar `./install.sh` em um shell novo, instale e persista o fnm, selecione o alvo validado e confirme o Node. O alvo localmente validado é o fnm 22.22.3:

```bash
# Adicione a saída do instalador ao shell quando solicitado
curl -fsSL https://fnm.vercel.app/install | bash
# ~/.zshrc (macOS):
eval "$(fnm env --use-on-cd --shell zsh)"
# ~/.bashrc (Linux):
eval "$(fnm env --use-on-cd --shell bash)"
fnm install 22.22.3
fnm default 22.22.3
fnm use 22.22.3
node --version  # v22.22.3
```

Abra um shell novo, confirme `node --version` como `v22.22.3` e só então execute `./install.sh`.

### Linux e macOS

```bash
gh auth login
gh repo clone Evolvera/evolvera
cd evolvera

./install.sh

pi
/login
```

#### Capturas do Windows no PI executado pelo WSL

No Warp para Windows, `Ctrl+V` pode ser consumido pelo terminal antes de chegar ao PI no WSL. Sob WSL, o setup adiciona `Alt+V` como atalho alternativo sem remover `Ctrl+V`: use `@` + `Alt+V` para inserir o path temporário da captura feita com `Win+Shift+S`.

O `install.sh` instala `~/.pi/agent/keybindings.json` somente sob WSL e somente quando o destino ainda não existe. No macOS e no Linux nativo, o instalador não cria esse arquivo e os padrões do PI permanecem inalterados. Configurações personalizadas existentes, inclusive links simbólicos, são preservadas. Isso trata a entrega do atalho pelo terminal ao PI; não é uma correção para todo terminal.

### Windows

```powershell
gh auth login
gh repo clone Evolvera/evolvera
Set-Location evolvera

# Se necessário:
nvm install 22.19.0
nvm use 22.19.0
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

.\install.ps1

pi
/login
```

Se a política local ainda bloquear o instalador:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

### Verificação do setup

Feche e abra o terminal depois da primeira instalação. Então confirme:

```bash
pi --version
node --version
```

Linux/macOS:

```bash
test -f "$HOME/.pi/agent/SYSTEM.md"
test -d "$HOME/.pi/agent/agents"
test -d "$HOME/.pi/agent/skills"
test -d "$HOME/.pi/agent/extensions"
```

Windows:

```powershell
Test-Path "$HOME\.pi\agent\SYSTEM.md"
Test-Path "$HOME\.pi\agent\agents"
Test-Path "$HOME\.pi\agent\skills"
Test-Path "$HOME\.pi\agent\extensions"
```

Dentro do PI, use `/reload` depois de alterar agentes, skills, extensões ou configuração.

## O que o instalador faz

O checkout do repositório é a fonte versionada. O runtime do usuário fica em `~/.pi/agent` (`$HOME\.pi\agent` no Windows).

Os instaladores:

1. verificam Node.js `>=22.19.0`;
2. instalam a versão configurada de `@earendil-works/pi-coding-agent`;
3. criam os diretórios do runtime;
4. copiam a configuração versionada para `~/.pi/agent`;
5. copiam agentes, skills, extensões e temas;
6. instalam os packages PI configurados;
7. criam `mcp.json` somente quando ele ainda não existe.

### O que é sobrescrito

Ao executar novamente o instalador, arquivos com o mesmo nome nestas superfícies são atualizados pela versão do repositório:

- `settings.json`, `models.json`, `SYSTEM.md` e `subagents.json`;
- `agents/*.md`;
- conteúdo das skills versionadas;
- `extensions/*.ts`;
- temas versionados.

O instalador não apaga genericamente arquivos antigos que não existem mais no repositório. O instalador Linux/macOS remove explicitamente apenas a extensão aposentada `plan-heavy.ts`.

### O que é preservado

- autenticação local;
- sessões e histórico;
- arquivos sem colisão de nome no runtime;
- `~/.pi/agent/mcp.json` quando ele já existe.

Isso significa que mudar `config/mcp.json` não substitui automaticamente o MCP de quem já instalou. A atualização desse arquivo deve ser feita conscientemente no runtime.

### Diferenças de plataforma

O Windows também instala `pi-provider-kimi-code`. A baseline do PI pode ser sobrescrita explicitamente para testes controlados:

```bash
PI_CODING_AGENT_VERSION=0.82.1 ./install.sh
```

```powershell
$env:PI_CODING_AGENT_VERSION = "0.82.1"
.\install.ps1
```

## Usar no VS Code

Instale [PI for VS Code](https://marketplace.visualstudio.com/items?itemName=pi0.pi-vscode) pelo Marketplace.

### Primeiro uso

1. Abra no VS Code a pasta do projeto em que o PI deve trabalhar.
2. Abra a Command Palette.
3. Execute **`Pi: Open`** ou use `Ctrl+Alt+3`.
4. O PI abrirá em um terminal integrado ao lado do editor.
5. Faça `/login` se ainda não houver provider autenticado.
6. Envie o pedido normalmente.

A extensão também oferece:

- **Pi: Open with File** — abre o PI com o arquivo e a posição atual;
- **Pi: Send Selection** — envia a seleção do editor;
- botão **PI** na status bar;
- participante `@pi` no VS Code Chat;
- bridge para seleção, arquivos abertos, diagnósticos, símbolos, definições, referências, hover, code actions, formatação e notificações.

### Se o VS Code não encontrar `pi`

Descubra o caminho do executável:

```bash
command -v pi
```

```powershell
(Get-Command pi).Source
```

No VS Code, configure `pi-vscode.path` com o caminho absoluto retornado e execute **Developer: Reload Window**.

### Confirmar que o bridge está funcionando

Abra um arquivo do projeto e peça ao PI, por exemplo:

```text
mostre os diagnósticos do arquivo aberto no VS Code
```

ou selecione um trecho e peça:

```text
explique a seleção atual
```

O PI deve conseguir usar as ferramentas `vscode_*` fornecidas pela extensão.

> **Compatibilidade:** no `pi-vscode` 0.0.9, não use **Upgrade Pi and Packages**. Esse comando instala a família `@mariozechner/pi-coding-agent`, enquanto este harness usa o fork `@earendil-works/pi-coding-agent`. Atualize pelo repositório e execute o instalador da plataforma.

## Como o harness funciona

### Superfícies principais

| Superfície | Responsabilidade |
|---|---|
| `config/SYSTEM.md` | Política global, segurança, workflow e regras de roteamento instaladas como `~/.pi/agent/SYSTEM.md`. |
| `agents/*.md` | Definições dos subagentes: modelo, thinking, ferramentas e contrato operacional. |
| `skills/*/SKILL.md` | Procedimentos carregados quando o tipo de tarefa exige aquele workflow. |
| `extensions/*.ts` | Comandos, ferramentas e hooks executados pelo runtime PI. |
| `config/settings.json` | Provider/modelo padrão, thinking, tema e packages. |
| `config/models.json` | Catálogo e overrides de modelos disponíveis. |
| `subagents.json` | Limite de concorrência dos subagentes. |
| `config/mcp.json` | Configuração inicial de MCP; atualmente fornece `context7`. |
| `.pi/` dentro de um projeto | Planos, memória, previews, recovery e outros artefatos locais daquele projeto. |

Não existe `config/AGENTS.md` neste harness. O roteamento ativo está distribuído entre `SYSTEM.md`, skills e definições de agentes.

### Agent, skill, extension e MCP

- **Agent:** executor com modelo, ferramentas e responsabilidade próprios. O PI principal delega uma missão delimitada.
- **Skill:** manual operacional. Define quando e como executar um workflow; não é um processo separado por si só.
- **Extension:** código TypeScript carregado pelo PI para adicionar tools, comandos ou hooks de runtime.
- **MCP:** integração externa que expõe ferramentas por um servidor separado.
- **System prompt:** contrato global usado pelo PI principal para decidir escopo, segurança, delegação e validação.

### Roteamento

O usuário normalmente descreve o resultado desejado; não precisa escolher manualmente um agente. O PI decide o caminho mais leve que preserve a correção:

```text
mudança trivial e alvo conhecido
  → ação direta

investigação de codebase
  → scout

mudança complexa ou cross-cutting
  → planner → builder(s)

implementação delimitada
  → builder adequado ao tipo de trabalho

prova independente necessária
  → teste pós-build e/ou validator

website
  → workflow específico de website ou Home Preview
```

Agentes não substituem o PI principal: o orquestrador continua responsável por escopo, integração, revisão do diff, validação e entrega.

### Política Anthropic

Os modelos Anthropic nativos com janela de contexto de 1M são limitados em runtime a **450K**, sem alterar `maxTokens` ou o limite de saída (Opus 5 mantém 128K). As rotas aprovadas para Opus 5 são:

- `agents/builder-design.md` — `anthropic/claude-opus-5`, `medium`;
- `agents/builder-heavy-design.md` — `anthropic/claude-opus-5`, `high`;
- `agents/website-designer.md` — `anthropic/claude-opus-5`, `xhigh`;
- `agents/plan-briefer-fable.md` — `anthropic/claude-opus-5`, `high`.

### Descobrir a configuração ativa

Evite manter contagens e tabelas de modelos manualmente. Consulte as definições versionadas:

```bash
# Agentes disponíveis no checkout
find agents -maxdepth 1 -type f -name '*.md' -print | sort

# Modelo e thinking de cada agente
for file in agents/*.md; do
  echo "--- $file"
  sed -n '1,16p' "$file" | grep -E '^(display_name|model|thinking):'
done

# Skills
find skills -mindepth 1 -maxdepth 1 -type d -print | sort

# Extensões
find extensions -maxdepth 1 -type f -name '*.ts' -print | sort
```

No runtime instalado, substitua os caminhos relativos por `~/.pi/agent/...`.

## Uso diário

Fale com o PI em termos do resultado e das restrições relevantes:

```text
corrige o erro de autenticação e executa o teste afetado
```

```text
explica por que esta consulta falha quando a suíte roda em paralelo
```

```text
planeja esta integração sem alterar o contrato público atual
```

```text
implementa a task 04, valida e deixa o diff pronto para revisão
```

```text
revisa este PR somente contra o escopo aprovado
```

O PI deve investigar o repositório antes de fazer perguntas factuais que o código possa responder. Ações destrutivas, deploy, force push, merge, compra ou mudanças ambíguas de segurança continuam exigindo autorização explícita.

### Comandos úteis

| Comando | Uso |
|---|---|
| `/login` | Autenticar ou selecionar provider/modelo. |
| `/reload` | Recarregar configuração, agents, skills e extensions após alterações. |
| `/fast on` / `/fast off` | Alternar o fast mode fornecido pela extensão local. |
| `/goal <critério>` | Manter um critério de conclusão entre turnos. |
| `/goal status` | Ver o estado do Goal Mode. |
| `/goal clear` | Encerrar o Goal Mode. |

O `/goal` usa um avaliador Anthropic autenticado e não possui fallback para outro provider. Sem Anthropic disponível, o comando informa o bloqueio e não ativa o objetivo.

## Atualizar

Antes de atualizar, preserve mudanças locais intencionais no checkout com commit ou stash.

Linux/macOS:

```bash
cd evolvera
git status --short
git pull --ff-only
./install.sh
```

Windows:

```powershell
Set-Location evolvera
git status --short
git pull --ff-only
.\install.ps1
```

Depois, reinicie o terminal/VS Code ou use `/reload`.

## Rollback

### Rollback local para uma revisão conhecida

Use um worktree temporário para não mexer nas alterações do checkout atual:

```bash
git worktree add ../evolvera-rollback <good-commit-sha>
cd ../evolvera-rollback
./install.sh
cd ../evolvera
git worktree remove ../evolvera-rollback
```

No Windows, execute `install.ps1` dentro do worktree.

Isso reinstala a revisão escolhida no runtime local sem reescrever o histórico do repositório. Uma execução futura do instalador na branch atual aplica novamente a versão nova.

### Reverter uma mudança compartilhada

Se uma alteração já foi enviada e deve ser desfeita para todos:

```bash
git revert <bad-commit-sha>
git push origin main
./install.sh
```

Não use force push para rollback normal.

### Backup local opcional

Antes de uma atualização sensível, é possível copiar `~/.pi/agent`. Esse backup pode conter credenciais e sessões: mantenha-o somente na máquina local e nunca faça commit.

## Estrutura do repositório

```text
.
├── README.md
├── install.sh
├── install.ps1
├── config/
│   ├── SYSTEM.md
│   ├── settings.json
│   ├── models.json
│   ├── keybindings.json
│   └── mcp.json
├── subagents.json
├── agents/
├── skills/
├── extensions/
├── themes/
├── interface/
└── docs/
```

`interface/` contém o PI Studio standalone e possui documentação própria em `interface/README.md`.

## Segurança

O PI pode executar shell, editar arquivos e acessar credenciais disponíveis ao processo. Portanto:

- abra somente projetos em que o PI está autorizado a trabalhar;
- revise diffs antes de commit e push;
- não coloque secrets em prompts, logs, planos ou memória do projeto;
- não versione `auth.json`, sessões, backups ou arquivos locais sensíveis;
- monte no Docker somente os diretórios necessários;
- exija confirmação para operações destrutivas ou externas.

## Troubleshooting

### `pi` não é encontrado

Confirme a instalação e o `PATH`:

```bash
npm list -g --depth=0 | grep pi-coding-agent
npm config get prefix
command -v pi
```

No Windows:

```powershell
npm list -g --depth=0
npm config get prefix
Get-Command pi
```

Feche e abra o terminal após corrigir o `PATH`.

### `EACCES: permission denied` no npm

Configure um prefixo global pertencente ao usuário:

```bash
npm config set prefix "$HOME/npm-global"
npm config set globalconfig "$HOME/npm-global/etc/npmrc"
export PATH="$HOME/npm-global/bin:$PATH"
```

Persista o `PATH` no arquivo de inicialização do seu shell e execute novamente o instalador.

### Alterei o harness, mas o PI continua com a versão antiga

Se a mudança foi feita no checkout:

1. execute novamente `install.sh` ou `install.ps1`;
2. use `/reload` ou abra uma nova sessão;
3. confirme o arquivo correspondente em `~/.pi/agent`.

Se o checkout já está localizado em `~/.pi/agent`, `/reload` ou uma nova sessão normalmente basta para arquivos carregados dinamicamente.

### O VS Code não vê seleção ou diagnósticos

1. confirme que o PI foi aberto pelo comando **Pi: Open**, não por um terminal externo;
2. mantenha um workspace e um arquivo abertos;
3. execute **Developer: Reload Window**;
4. confira `pi-vscode.path`;
5. teste novamente com `vscode_get_selection` ou `vscode_get_diagnostics`.

### PI quebrou após `Upgrade Pi and Packages`

Reinstale o fork compatível e rode novamente o instalador do harness:

```bash
npm uninstall -g @mariozechner/pi-coding-agent
npm install -g @earendil-works/pi-coding-agent@0.82.1
./install.sh
```

Windows:

```powershell
npm uninstall -g @mariozechner/pi-coding-agent
npm install -g @earendil-works/pi-coding-agent@0.82.1
.\install.ps1
```

Depois, abra uma nova janela do terminal/VS Code e confirme `pi --version`.

## Fontes de verdade

Quando README e runtime divergirem, use esta ordem:

1. arquivos ativos em `agents/`, `skills/`, `extensions/` e `config/`;
2. comportamento dos instaladores;
3. diagnósticos e comandos executados no runtime;
4. este README.

Ao mudar agentes, modelos, skills, extensões, MCP ou instalação, atualize a documentação no mesmo commit quando a experiência de setup ou uso também mudar.
