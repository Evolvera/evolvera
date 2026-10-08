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

A baseline padrão instalada pelos scripts é `@earendil-works/pi-coding-agent@0.83.0`. O patch de continuidade descrito abaixo é compatível somente com essa versão; uma versão selecionada por override que não seja `0.83.0` faz o instalador falhar fechado.

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
5. copiam agentes, skills, extensões normais e temas; `extensions/plastic-memory/` não é instalado enquanto seu caminho de compactação estiver desativado;
6. instalam somente os packages PI configurados (Goal Mode e integrações auxiliares); o template de configuração não ativa `plastic-memory` nem `pi-observational-memory`;
7. criam `mcp.json` somente quando ele ainda não existe;
8. escrevem `settings.json` por último, depois de todos os recursos terem sido preparados. O template define `compaction.reserveTokens: 65536` para iniciar a compactação com mais margem antes do limite de saída.

### Patch de continuidade do PI 0.83.0

Depois do `npm install` global e antes de verificar a instalação ou ativar `settings.json`, os instaladores executam `scripts/patch-pi-083-threshold-cancel.mjs`. O patcher valida o nome/versão exatos, o caminho, a cardinalidade e o SHA-256 do anchor conhecido, e então altera somente o cancelamento de auto-compaction por `reason === "threshold"`: mensagens já enfileiradas podem continuar. Cancelamento por overflow, compactação manual e o caminho de sucesso permanecem inalterados.

Qualquer versão, conteúdo ou cardinalidade desconhecidos são recusados sem substituir o arquivo. A operação é idempotente, atômica e preserva o modo do arquivo. A verificação segura usa exclusivamente uma fixture sintética temporária e descartável:

```bash
node scripts/test/patch-pi-083-threshold-cancel.smoke.mjs
```

Essa tarefa **não aplicou o patch ao PI instalado em tempo real**. A execução futura de um instalador pode aplicá-lo ao pacote global correspondente e exige confirmação nova para essa consequência; a smoke não é prova de uma campanha live.

Em seguida, `scripts/patch-pi-083-context-wall-retry.mjs` corrige a parada após compactação: quando uma execução longa chega à parede de contexto, o PI reduz `max_tokens` a 1, o provedor devolve `stopReason: "length"` e o PI 0.83.0 compactava por threshold sem retomar, exigindo uma mensagem do usuário. O patch trata esse `length` acima do limiar de compactação como overflow e reutiliza o compact-and-retry de tentativa única já existente. Um segundo corte na parede encerra com erro em vez de repetir, e respostas completas continuam com a compactação por threshold comum. A smoke roda uma `AgentSession` real sobre cópias descartáveis do pacote instalado com o provedor faux, sem rede:

```bash
node scripts/test/patch-pi-083-context-wall-retry.smoke.mjs
```

### Thinking `ultra` no PI 0.83.0

Os instaladores executam `scripts/patch-pi-083-ultra-thinking.mjs` logo após o patch de continuidade e `scripts/patch-pi-subagents-ultra-thinking.mjs` depois de instalar `@tintinweb/pi-subagents@0.18.2`. Os patchers adicionam `ultra` às superfícies de tipo, CLI, catálogo de níveis, schema de modelos, TUI e subagentes. O valor só aparece para modelos cujo `thinkingLevelMap` declara suporte; `models.json` habilita `ultra: "ultra"` para `openai-codex/gpt-6-astra`.

Na TUI, `ultra` usa duas cores opcionais, `thinkingUltra` e `thinkingUltraAlt`, alternadas a cada 350 ms. Temas antigos permanecem válidos: ambas caem para `thinkingMax` e depois `thinkingXhigh`. Os temas embutidos usam cores mais intensas que `max` e próximas entre si.

As trocas são fail-closed por nome/versão/cardinalidade, idempotentes, atômicas por arquivo e preparadas com rollback. Validação sem recursos stateful:

```bash
node scripts/test/patch-ultra-thinking.smoke.mjs
```

### Compatibilidade OAuth do Claude Fable 5.1

O template instala `npm:@gotgenes/pi-anthropic-auth@2.0.6`. Depois dessa instalação, e antes da ativação final de `settings.json`, os instaladores executam `scripts/patch-anthropic-client-version.mjs`. O patcher é limitado às baselines `@earendil-works/pi-coding-agent@0.83.0` e `@gotgenes/pi-anthropic-auth@2.0.6` ou a instalação adaptada `2.0.1` (preservada sem reinstalação), alterando somente os anchors conhecidos para reportar Claude Code `2.1.280`. Isso é necessário porque o OAuth do Opus 5.5 exige Claude Code `2.1.280+` (o Fable 5.1 exigia `2.1.251+`); o patch corrige os headers de compatibilidade do PI e do adapter OAuth, não depende de atualizar o CLI standalone.

Instalações que já carregam um valor escrito por uma versão anterior deste patcher (`2.1.257`) são migradas para o alvo atual com a mesma verificação de identidade, cardinalidade e rollback; qualquer outro valor continua recusado. Depois de aplicar o patch, reinicie a sessão do PI para que o módulo já carregado seja substituído.

A operação é fail-closed, idempotente, atômica por arquivo, rollback-safe entre os dois alvos e preserva o modo e os bytes fora dos anchors. Valide-a somente com a fixture descartável:

```bash
node scripts/test/patch-anthropic-client-version.smoke.mjs
```

### Ativação, colisões e atualização

A ativação é deferred e collision-aware quando o extension é disponibilizado manualmente no runtime. Configuração `plastic-memory` válida e habilitada, sem um package OM efetivo, dá ao plastic-memory um único owner full. Configuração ausente, inválida ou desabilitada, ou a presença efetiva de `npm:pi-observational-memory`, mantém o bridge em modo context-only e não instala hooks full; não há cutover implícito. Os instaladores atuais não copiam o extension nem ativam sua configuração.

Ao executar novamente o instalador, os recursos versionados são preparados primeiro e a configuração ativadora é escrita por último:

- `settings.json`, `models.json`, `SYSTEM.md`, `subagents.json` e `pi-goal.json`;
- agents e skills versionados;
- arquivos de extensão no nível raiz; `extensions/plastic-memory/` é deliberadamente excluído enquanto o caminho de compactação estiver desativado;
- temas versionados.

A configuração ativa em `~/.pi/agent/settings.json` só muda quando o instalador é executado. Arquivos ou diretórios antigos do package OM que já estejam no destino ficam inertes; o instalador não os apaga nem desinstala genericamente. A atualização não promete nem executa migração de memória.

A extensão `native-compaction-routing.ts` roteia a compactação nativa os gatilhos manual, threshold e overflow para `openai-codex/gpt-6-luna` em `medium` (medido: ~2,5× mais rápido que `xhigh`, qualidade equivalente), sem trocar o modelo da conversa, preservando a preparação e o resultado do SDK; se o Luna falhar (ausência de modelo/autenticação, queda do provedor ou resultado inválido), o modelo principal da conversa faz a compactação, com aviso; só quando ambos falham, ou em abort, a compactação é cancelada com o histórico intacto. Depois de alterar a extensão, use `/reload`; com extensões desativadas ou a extensão ausente, a compactação nativa padrão continua responsável. O contexto público da extensão não expõe stream/retry da sessão, então essa rota usa os defaults do `compact` para esses opcionais, sem inventar um prompt, alterar configuração global ou reescrever o provider. As instruções do usuário em `/compact` são preservadas. Não ative simultaneamente outro handler que substitua a compactação, como o modo completo de Plastic Memory. A Plastic Memory também usa `openai-codex/gpt-6-luna` (`medium`); configurações explícitas antigas com `gpt-5.6-luna` são aceitas e convertidas em memória, sem editar os settings persistidos.

#### Corte seguro na atualização de Flow

Durante a transição, `install.sh` (Linux/macOS) e `install.ps1` (Windows) param antes de qualquer mutação quando o checkout contém `skills/flow-orca` e o runtime ainda contém o skill legado em `~/.pi/agent/skills/flow` (no Windows, `$HOME\.pi\agent\skills\flow`). Isso evita que as duas skills sejam descobertas juntas.

Nesse caso, preserve os dados da campanha em `.pi/flow`; eles não são o skill legado. Preserve também o diretório legado e mova-o manualmente para fora da árvore de descoberta de skills, por exemplo para uma pasta de backup fora de `~/.pi/agent/skills` (ou de `$HOME\.pi\agent\skills` no Windows). Nenhum instalador apaga ou move esse diretório automaticamente. Depois, execute novamente o instalador da sua plataforma.

### O que é preservado

- autenticação local;
- sessões e histórico;
- arquivos sem colisão de nome no runtime;
- `~/.pi/agent/mcp.json` quando ele já existe.

Isso significa que mudar `config/mcp.json` não substitui automaticamente o MCP de quem já instalou. A atualização desse arquivo deve ser feita conscientemente no runtime.

### Diferenças de plataforma

O Windows também instala `pi-provider-kimi-code`. Os scripts usam `@earendil-works/pi-coding-agent@0.83.0` por padrão; a baseline pode ser sobrescrita explicitamente para testes controlados:

```bash
PI_CODING_AGENT_VERSION=0.83.0 ./install.sh
```

```powershell
$env:PI_CODING_AGENT_VERSION = "0.83.0"
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
| `extensions/` | Comandos, ferramentas e hooks executados pelo runtime PI; os instaladores copiam apenas os arquivos flat enquanto `plastic-memory` estiver desativado. |
| `extensions/project-memory.ts` | Bridge context-only de compatibilidade para a superfície flat de memória. |
| `config/settings.json` | Provider/modelo padrão, thinking, tema e packages; não ativa `plastic-memory` nem o package OM. |
| `config/models.json` | Catálogo e overrides de modelos disponíveis. |
| `subagents.json` | Limite de concorrência dos subagentes. |
| `config/mcp.json` | Configuração inicial de MCP; atualmente não declara nenhum servidor (`mcpServers` vazio). |
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

prova de app em emulator/simulator
  → skill app-validator: scout entende → builder mantém harness → app-validator valida device

website
  → workflow específico de website ou Home Preview
```

Agentes não substituem o PI principal: o orquestrador continua responsável por escopo, integração, revisão do diff, validação e entrega.

### Política Anthropic

Os modelos Anthropic nativos com janela de contexto de 1M são limitados em runtime a **450K**, sem alterar `maxTokens` ou o limite de saída (Opus 5.5 mantém 128K). As rotas aprovadas para Opus 5.5 são:

- `agents/builder-design.md` — `anthropic/claude-opus-5-5`, `medium`;
- `agents/builder-heavy-design.md` — `anthropic/claude-opus-5-5`, `high`;
- `agents/website-designer.md` — `anthropic/claude-opus-5-5`, `xhigh`;
- `agents/plan-briefer-fable.md` — `anthropic/claude-opus-5-5`, `high`.

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

### Modos de autorização

O comportamento de execução é propriedade de runtime de `extensions/execution-mode.ts`, não de memória do chat nem de uma promessa textual do modelo. A extensão persiste a escolha e injeta automaticamente apenas o modo ativo, mais o contrato comum de continuação/autoridade, em todas as sessões PI que a carregam — inclusive prompts customizados e workers PI do Orca. Agentes customizados com `extensions: false` não recebem esse hook; seus handoffs delimitados continuam carregando modo e escopo pelo contrato de `agent-guide`/`builder`.

Use `/execution-mode` para abrir o seletor, ou `/execution-mode <supervised|autonomous|yolo> [global|project|session]`; aliases `SUPERVISIONADO`, `AUTÔNOMO` e `AUTÔNOMO ATÉ PR` são aceitos e os valores persistidos são `supervised`, `autonomous` e `yolo`. O escopo default é `global`; precedência verificada é `session > project confiável > global > autonomous`. `/execution-mode status` e cada gravação exibem `EXECUTION_MODE={"mode":"…","source":"…"}`. O valor ausente resolve para `autonomous`; configuração inválida resolve fail-safe para `supervised` com diagnóstico sanitizado e receipt marcado `valid:false`, nunca confirmação válida para dispatch. O pin de sessão usa entradas nativas fora do contexto do modelo; numa sessão nova, o SDK grava essas entradas junto da primeira resposta do assistente. O Flow verifica o pin antes de cada dispatch, inclusive após retomada. `SYSTEM.md` (espelhado em `config/SYSTEM.md`) mantém a autoridade permanente, a segurança e o ponteiro para esse owner de runtime.

| Modo | O que cobre | Onde para |
|---|---|---|
| `SUPERVISIONADO` | Você aprova cada estágio ou efeito proposto | Antes de cada estágio novo; comandos dentro de um estágio já aprovado não são reperguntados |
| `AUTÔNOMO` (**default**) | Levar o resultado autorizado até o fim: evidência, trabalho no escopo, validação segura e entrega | Nenhum efeito externo final inventado; em entrega de software autorizada vai até o PR e para antes do merge |
| `YOLO` | Autoridade de fechamento mais ampla no escopo da tarefa, incluindo merge após review independente do head SHA final e dos checks | Deploy, migração e outras operações consequentes só quando nomeadas e aprovadas à parte |

`AUTÔNOMO` é o default quando você não pediu outro modo, e o PI não repergunta a mesma autorização enquanto ação, alvo, método, limites e evidência não mudarem — troca de fase, de ferramenta ou de agente não expira aprovação. A fronteira do PR vale só para entrega de software de verdade: pedido de explicação, revisão, plano ou rascunho termina no artefato pedido, sem PR, publicação ou envio inventados. Gates de evidência e de segurança são separados do modo: ação destrutiva, recurso não descartável, deploy, migração, credencial e teste com estado continuam exigindo os gates exatos, e nenhum modo é bypass de runtime.

### Entrega por issue com Flow Orca

A entrega de backlog → issues → PR usa uma única skill, `flow-orca`, que substitui o antigo `flow`. O PI deve carregá-la automaticamente para campanhas por issues/board e coordenação de workers PI de issues em worktrees Orca; não é preciso citar o nome. Criação simples de worktree, handoff sem supervisão e explicação isolada continuam fora desse fluxo. A invocação explícita também permanece disponível:

```text
/skill:flow-orca
User: [lista] — cria as issues e toca a campanha
```

No intake da campanha, o modo global já resolvido é reaproveitado (sem pergunta separada de modo), mas o PI ainda pede um grant de campanha explícito e escopado — o default sozinho não autoriza campanha:

- a **base branch por repositório** (nada de `main` presumida; multi-repo usa uma base por repo);
- o **modo** aplicado à campanha: `SUPERVISIONADO` aprova cada início de issue, commit, push e PR; `AUTÔNOMO` (alias legado aceito: `AUTÔNOMO ATÉ PR`) cobre agendamento, workspaces, implementação, commit, push e PR; `YOLO` acrescenta o merge, só depois de review independente do head SHA final e dos checks exigidos, e cobre deploy/migração apenas quando essas operações forem nomeadas e aprovadas à parte. `YOLO` é escopo de aprovação, nunca bypass de segurança.

**O GitHub controla tudo.** O grant da campanha (escopo, bases, modo, teto, operações nomeadas e a proveniência da aprovação) fica numa seção `## Campaign grant` do README do próprio GitHub Project, preservando o resto do texto; as ACs, os escopos e as dependências (sempre como URL completa da issue + gate) ficam no body de cada issue; progresso, blockers e resultados ficam nos comentários. Esse registro remoto é evidência de uma aprovação que você já deu — ele não se autoriza sozinho e não desliga nenhum gate de segurança. Não existe issue de controle, backlog paralelo nem plano/DAG/estado local de entrega: a ordem de execução é derivada em memória a cada releitura do GitHub, e uma pasta `.pi/flow/` antiga vale só como histórico opcional, sem autoridade.

Durante a campanha, cada issue recebe uma workspace do Orca, uma branch real criada por ele e uma sessão PI. Os registros Run/Task/Dispatch do Orca são supervisão de runtime de **uma tentativa** da issue admitida, nunca uma segunda lista de trabalho. O scheduler é contínuo com teto de **seis** workers PI de issue simultâneos; a vaga só volta quando aquele worker assenta com segurança — timeout ou terminal ocioso não liberam vaga. O board usa `Backlog`, `Ready`, `In progress`, `In review`, `Blocked` e `Done`; `Blocked` é aditivo em boards existentes e recebe as issues com dependência externa (credencial, acesso, decisão humana), junto com seus dependentes. Todo status é atualizado **e relido**, e `Done` exige PR com `mergedAt` real na base escolhida, checks/review, issue fechada e status relido — `worker_done`, PR aberto ou PR fechado sem merge não são `Done`. A conclusão chega pela inbox do Run e pela notificação nativa do Orca ao coordenador ocioso: sem polling nem loop de monitoramento. O aviso apenas desperta o PI, que lê o lote completo, reconcilia os IDs e confirma o Delivery; sem suporte comprovado, o retorno automático fica não verificado e a alternativa manual precisa ser explícita. Após merge/`Done` verificados e assentamento de Task/Goal/terminais, o coordenador remove a worktree descartável da issue quando a autoridade específica e os gates de identidade, conteúdo e recuperação estiverem provados; caso contrário, retém com motivo. A remoção também pode apagar a branch **local**, encerra os terminais da workspace e remove seu histórico: resultados necessários e commits recuperáveis devem estar fora dela antes. Nada de `--force`, hooks de archive, dados de usuário, recursos alheios ou limpeza como recuperação de incidente.

Esta versão do harness traz a skill e a política verificadas **estaticamente** (validação de skill, smokes de contrato, mirrors e arquitetura). Nenhuma campanha live, operação Orca, mutação de GitHub ou deployment foi executada aqui: não é certificação de campanha live.

### Comandos úteis

| Comando | Uso |
|---|---|
| `/login` | Autenticar ou selecionar provider/modelo. |
| `/reload` | Recarregar configuração, agents, skills e extensions após alterações. |
| `/communication-mode` | Selecionar o estilo de comunicação (default, default+caveman ou caveman). |
| `/execution-mode` | Selecionar o modo de execução (supervised, autonomous ou yolo). |
| `/orchestration conductor` / `standard` / `status` | `conductor` transforma a sessão principal em coordenadora de sub-PIs: troca só o bloco do `SYSTEM.md` por um prompt de orquestração (delegar engenharia aos PIs em worktrees Orca, esperar eventos sem `sleep`, painel de status) e copia literalmente as seções Communication, Authorization, Safety e Stop Rules. Skills, memória e modo de execução continuam. Vale só para a sessão atual; workers, subagentes e `/new` seguem no prompt padrão. Se o `SYSTEM.md` perder uma seção obrigatória, volta ao padrão com aviso. |
| `/maestro` | Ativar, desativar ou consultar a seleção automática de modelo. |
| `/attention` | Gerenciar as notificações de ociosidade do agente principal. |
| `/fast on` / `/fast eco` / `/fast ultra` / `/fast ultra-eco` / `/fast off` / `/fast eco default on\|off` | Fast fica desativado por padrão; `eco` ativa Fast apenas para subagentes OpenAI Codex elegíveis (`service_tier: "priority"`) na sessão atual. `eco default on\|off` salva a preferência global em `settings.json`, aplicada somente a futuras inicializações TUI; o padrão é `off`. `on` ativa Fast na principal e nos subagentes elegíveis; `ultra`/`ultra-eco` fazem o mesmo que `on`/`eco`, mas pedem `service_tier: "ultrafast"` quando o modelo é `gpt-6-astra` ou `gpt-6.1-sol` (únicos com Ultrafast; exige Pro $500 ou Enterprise/Edu elegível, 8× o limite incluído / 6× créditos) e Fast nos demais; `off` desativa Fast em todos. O modo escolhido sobrevive à troca de modelo: com um modelo sem Fast na principal (ex.: Claude), `on`/`ultra` seguem valendo para os subagentes elegíveis (status `⚡SUB`/`🚀SUB`). O modo explícito continua no novo chat raiz criado por `/new`; subagentes isolados permanecem no tier padrão. |
| `/goal <critério>` | Manter um critério de conclusão entre turnos. |
| `/goal status` | Ver o estado do Goal Mode. |
| `/goal clear` | Encerrar o Goal Mode. |
| `/memory:status` | Mostrar estado e modo da memória de projeto. |
| `/memory:view` ou `/memory:view full` | Mostrar bloco de contexto injetado (resumo/índices). |
| `/om:status` | Alias da superfície ativa atual da memória; comportamento contextual equivalente a `/memory:status`. |
| `/om:view` ou `/om:view full` | Alias da superfície ativa atual da memória; comportamento contextual equivalente a `/memory:view`. |

Durante uma resposta ativa no terminal, a extensão `working-time.ts` substitui a mensagem padrão pelo contador `Working for …`. O tempo reinicia em cada `turn_start` e é limpo em `turn_end`, então mede a resposta atual em vez da sessão inteira.

`todo-reconciliation.ts` injeta lembretes transitórios antes da resposta final após nova solicitação, trabalho posterior à revisão ou entrega concluída/falha de subagente iniciado pelo PI principal nesta sessão. Uma listagem/mutação bem-sucedida limpa a necessidade até novo trabalho; lista somente leitura basta se nada precisar mudar. Pode solicitar uma única rodada corretiva, o que pode acrescentar uma chamada ao modelo. Lê o último resultado `todo` da branch; nunca marca tarefas concluídas nem trata uma listagem como prova semântica. Não é veto final e modelos podem ignorar o lembrete. Use `/reload` para ativar após instalar ou alterar.

O `/goal` é fornecido por `@narumitw/pi-goal`: mantém o estado por sessão e encerra somente pela ferramenta explícita `goal_complete` ou por `goal_blocked` com evidência. A instalação padrão não limita continuações automáticas (`continuationLimits.automaticTurns: null`), mas pausa após três turnos consecutivos sem progresso; use `/goal pause`, `/goal resume` ou `/goal clear` para controlar o ciclo.

As operações canônicas usam `memory_recall` (ID exato `pm:p:`/`pm:c:`) e `memory_search` (filtros bounded; metadados/snippets). `/memory:status` e `/memory:view [visible|full]` mostram status/contexto, com aliases `/om:status` e `/om:view [visible|full]`. No root checked-in, `/memory:propose`, `/memory:accept`, `/memory:migrate`, `/memory:backfill` e `/memory:retry` retornam `unavailable`: não publicam, não migram, não executam backfill/retry e não chamam provider.

A segurança semântica é conservadora: cada ciclo é um turno concluído contíguo de até aproximadamente 100k tokens, sem multipart e com no máximo uma retry automática; 10k/20k são gatilhos de inspeção. Seis ciclos fechados usam stride por identidade, compactando os dois mais antigos e preservando os quatro mais recentes. Resultado detached só aplica após `settled`/idle, sem mensagens pendentes e com guardas do host; tentativa interna inválida ou não correspondente cancela. No-match manual, threshold ou overflow preserva o fallback nativo. Isso não é alegação de qualidade live.

Não use a sintaxe bare `recall(<id>)`: para projeto/chunk, use o ID exato nas ferramentas acima. `pi-observational-memory` permanece somente como compatibilidade legacy; se houver package OM efetivo, ou configuração plastic inválida/ausente/desabilitada, o plastic-memory fica bridge context-only sem hooks full. O modo flat-only permanece legado com marcador; o histórico pré-plastic fica `historical-unindexed` até backfill explícito report-first, cursor-bounded, de uma janela de turno concluído por vez, com pausa/retoma/retry e recovery-safe. O root atual não expõe seus comandos de autoridade.

## Testes

`node scripts/run-tests.mjs` executa as suítes classificadas e informa aprovados, falhos, excluídos e não classificados; também executa `npm test` em `interface/`. Consulte o runner antes de executar: suites sem isolamento de estado comprovado não devem rodar em recursos existentes.

## Desinstalar

Não existe desinstalador automático. Feche o PI e compare os arquivos instalados com este checkout antes de remover somente os recursos do harness confirmados. Preserve sessões, histórico, dados de projeto, credenciais, `mcp.json` e `keybindings.json`; o instalador não mantém um manifesto completo de propriedade. A instalação global do PI e a chave Jev, se presentes, ficam fora da árvore do harness e precisam de avaliação própria antes de qualquer remoção.

## Atualizar

Antes de atualizar, preserve mudanças locais intencionais no checkout com commit ou stash. O instalador prepara agentes, skills, extensões normais e demais recursos primeiro; remove uma cópia antiga de `extensions/plastic-memory/` e grava a configuração não ativadora por último. Assim, o caminho de compactação desativado não permanece ativo após uma atualização. O `settings.json` ativo só é substituído durante a execução do instalador.

A atualização não remove sessões, histórico, dados append-only ou dados de projeto, e não apaga diretórios antigos de packages; arquivos OM remanescentes ficam inertes. Não há instrução de cutover ou migração nesta atualização.

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

### Restaurar o arquivo do PI sem o patch

O patch é parte do pacote global instalado, não do checkout. Para restaurar a cópia exata não patched do host, reinstale diretamente a versão compatível, sem executar o patcher nem `install.sh`/`install.ps1` depois:

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@0.83.0
```

No Windows:

```powershell
npm install -g @earendil-works/pi-coding-agent@0.83.0
```

Essa ação altera o host e requer confirmação nova; a tarefa atual não a executou.

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

Isso reinstala a revisão escolhida no runtime local sem reescrever o histórico do repositório. O rollback restaura a combinação anterior de recursos e `settings.json` por staging com configuração por último; não exige apagar sessões, histórico, dados append-only/de projeto ou diretórios de packages. Uma execução futura do instalador na branch atual aplica novamente a versão nova.

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
│   ├── plastic-memory/
│   ├── project-memory.ts      # bridge context-only
│   └── *.ts                   # extensões flat legadas/atuais
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
npm install -g @earendil-works/pi-coding-agent@0.83.0
./install.sh
```

Windows:

```powershell
npm uninstall -g @mariozechner/pi-coding-agent
npm install -g @earendil-works/pi-coding-agent@0.83.0
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
