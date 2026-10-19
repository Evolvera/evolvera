# PI Studio

Web standalone para o PI com experiência de workspace: cada pasta é um projeto, o PI inicia automaticamente dentro do projeto aberto, e o histórico fica separado por projeto.

## Rodar local

```bash
cd /Users/j.henrique/.pi/agent/interface
npm start
# http://127.0.0.1:4123
```

Por padrão, o servidor descobre projetos em `$HOME` (ou em `/workspaces`, quando existir). Para apontar para uma pasta específica:

```bash
PI_WORKSPACES_DIR=/Users/j.henrique/EVOLVERA npm start
```

Ou múltiplas raízes:

```bash
PI_PROJECT_ROOTS="/Users/j.henrique/EVOLVERA:/Users/j.henrique/AYA" npm start
```

## Instalar como app (Windows/Mac)

Requer Node.js 22.19.0 ou superior e PI instalado pelo harness. O instalador configura o PI Studio nativo (sem Docker) junto dos demais componentes:

Windows (PowerShell):
```powershell
git clone --branch MiguelNevesZane https://github.com/Evolvera/evolvera.git; cd evolvera; .\install.ps1
```
Abra **PI Studio** no Desktop ou Menu Iniciar. Para parar o servidor iniciado pelo app, execute `powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME/.pi/agent/studio/desktop/launch-windows.ps1" -Stop`. Os logs ficam em `%LOCALAPPDATA%\PI Studio\server.log` e `server-error.log`.

macOS (Terminal):
```bash
git clone --branch MiguelNevesZane https://github.com/Evolvera/evolvera.git && cd evolvera && ./install.sh
```
Abra **PI Studio.app** em `~/Applications`. Para parar o servidor iniciado pelo app, execute `~/.pi/agent/studio/desktop/launch-macos.sh --stop`. O log fica em `~/Library/Logs/PI Studio/server.log`.

A instalação também disponibiliza o cliente de terminal em `~/.pi/agent/bin` (adicione-o manualmente ao PATH, se desejar). O modo Docker abaixo continua opcional.

## Windows (Docker, janela própria)

```powershell
powershell -ExecutionPolicy Bypass -File interfacestart-windows.ps1            # sobe e abre
powershell -ExecutionPolicy Bypass -File interfacestart-windows.ps1 -Rebuild   # após atualizar o repo
```

Roda `docker compose` (Docker Desktop precisa estar instalado) e abre o Edge/Chrome em modo `--app` em http://127.0.0.1:4123.

- A imagem roda o `install.sh` do repositório: mesmo PI 0.83.0, patches, agentes, skills, extensões e pacotes do harness, em Linux.
- Do host são montados só: a pasta do usuário em `/home/host` (projetos), `~/.pi/agent/auth.json` (mesmo login) e `~/.pi/agent/sessions` (mesmo histórico). O resto de `~/.pi/agent` não é montado porque os pacotes npm de lá são compilados para Windows.
- `PI_WEB_PATH_MAP` traduz os caminhos Windows gravados nas sessões (`C:\Users\...`) para o caminho montado, então os projetos e conversas do PI do Windows aparecem na barra lateral.
- Sem Docker: `node interface/server.mjs` também funciona no Windows (encontra o `cli.js` global do PI sozinho).

## Cliente de terminal (Windows)

O cliente de terminal se conecta ao mesmo projeto PI Studio aberto no navegador (não inicia outro PI independente):

```powershell
node C:\Users\Miguel.N.Zane\evolvera-MiguelNevesZane\interface\cli.mjs amphipod
```

Ou use `pi-studio amphipod` se a pasta `interface` já estiver no PATH. Opcionalmente informe `--url http://127.0.0.1:4123`. Para instalar o atalho, adicione a pasta ao PATH manualmente; o projeto não altera configurações do sistema.

## Experiência

- Sem formulário de start: abrir projeto = start automático do `pi --mode rpc` dentro daquela pasta.
- Visual estilo Claude Desktop: sidebar de projetos/sessões, chat em markdown, ferramentas recolhidas numa linha ("Executou 2 comandos · editou 1 arquivo"), cards de arquivo com +N −M, "Pensando" com timer, painel direito com Ambiente, Contexto e Saídas.
- Sidebar de projetos.
- Histórico por projeto lendo os JSONL de `~/.pi/agent/sessions`.
- Seleção de agente/subagente antes de enviar prompt.
- Chat com streaming, anexos de imagem, prompt/steer/follow-up/abort.
- Observabilidade: eventos RPC, tool calls, stderr, status, modelo/sessão.
- Console RPC raw para qualquer comando do protocolo PI.
- Ações por mensagem (ao passar o mouse ou focar): **Copiar** (resposta ou pergunta), **Editar** (RPC `fork` na mensagem: abre uma nova conversa até ali e devolve o texto ao campo de envio) e **Tentar de novo** (fork na última pergunta e reenvio). Editar e Tentar de novo só aparecem quando `get_fork_messages` confirma o ponto de fork, ficam desativados enquanto o PI responde e não se aplicam a mensagens com imagem (o fork devolve só texto).
- Lista de tarefas fixa acima do campo de envio, montada a partir do último resultado válido da ferramenta `todo` (`details.tasks`); `Alt+T` recolhe/expande (o navegador reserva `Ctrl+T` para nova aba; o cabeçalho do painel também é clicável).
- Avisos: ao fim de uma execução (`agent_settled`) ou quando uma extensão pede resposta, com a página oculta ou sem foco, mostra uma notificação do sistema (a permissão é pedida só no primeiro envio; preferência `pi-studio:notify`, padrão ligada, `0` desliga). A bolinha do projeto na barra lateral vira contorno ("terminou sem você ver", some ao voltar à página) ou âmbar pulsante ("aguardando resposta"). Só o projeto aberto emite eventos para o navegador, então os avisos valem para ele.
- Botão ↓ para voltar ao fim da conversa quando você rola para cima durante a resposta.
- Campo de envio: `/` abre os comandos (do PI via `get_commands` + embutidos `/new`, `/compact [instruções]`, `/name <título>`, `/export`, `/atalhos`); `@` sugere arquivos do projeto (`git ls-files`, ou varredura limitada fora de git); `!comando` roda no shell do projeto (RPC `bash`, saída ao vivo, Esc cancela) e o resultado entra no contexto.
- Atalhos: `Ctrl+/` lista todos, `Ctrl+K` paleta de comandos (ações, projetos, conversas e busca), `Ctrl+Shift+O` nova conversa, Esc interrompe, `↑` no campo vazio recupera a última mensagem, `Alt+T` tarefas, `Alt+W` worktrees.
- Conversas: menu ⋯ (ou clique direito) na conversa ativa para **Renomear** (`set_session_name`; a barra lateral usa o nome salvo) e **Exportar** em HTML (`export_html`, com "Copiar caminho"). Busca por texto em todas as conversas pela lupa da barra lateral ou pelo `Ctrl+K` (`GET /api/search`, sem acento/maiúsculas). O índice incremental em memória limita o texto a 64 KiB por sessão (no máximo 64 KiB × número de sessões, além dos metadados); a indexação inicial ocorre em segundo plano.
- Estado das conversas: cada conversa da barra lateral mostra um ponto antes da hora, com o estado em `title`/`aria-label`: **fazendo** (ponto pulsante), **aguardando** resposta (âmbar pulsante), **pronto** (ponto sólido apagado), **parado** (ponto vazado: interrompido) e **erro** (vermelho); conversa nova não mostra nada. O servidor lê só o final de cada arquivo da sessão (últimos 64 KiB, até 512 KiB; cache por caminho, mtime e tamanho) e decide pela última mensagem: resposta do assistente com `stop`/`length` = pronto, `aborted` = parado, `error` = erro; chamada de ferramenta, resultado ou pergunta sem resposta = fazendo se o arquivo mudou nos últimos 90 s, senão parado. A conversa ativa do projeto aberto usa o estado ao vivo do PI (respondendo, diálogo pendente, processo encerrado). Sub-PIs (sessões com `parentSession`) aparecem com o marcador "sub-PI" na dica. Enquanto alguma conversa do projeto aberto está fazendo ou aguardando, a lista é relida a cada 5 s. `GET /api/projects/:id/history` devolve por item `state`, `isSubagent`, `parentSession` e `lastActivity`.
- Fim de cada resposta: sob a última resposta do assistente de cada turno, a barra de ações mostra "terminou há 10 min" (ou "terminou agora"), atualizado a cada 30 s sem redesenhar a conversa; a dica mostra a data/hora exata e quanto o turno levou. Não aparece enquanto o turno ainda está em andamento.
- Configurações (engrenagem): tamanho da fonte, largura do chat, notificações, reduzir animações e mostrar raciocínio por padrão; salvas no navegador e aplicadas antes da primeira pintura.

## Worktrees e Orca

- Cada worktree é um projeto com o próprio PI; várias rodam ao mesmo tempo e a barra lateral mostra o estado de cada uma (rodando, aguardando resposta, terminou sem você ver).
- Configurações → Orca → **Integração com o Orca**: mostra a aba **Worktrees** no painel lateral com nome, branch, status, issue/PR, agentes e a última mensagem de cada worktree (como o resumo do Orca). Clicar abre a worktree.
- A integração fica **ligada por padrão quando o Orca está disponível** (uma escolha explícita desligada é respeitada); o botão **Worktrees** (ícone de branch, terceiro botão do grupo à direita da barra superior, só com o Orca disponível), `Alt+W` ou "Ver worktrees" no `Ctrl+K` abrem a **visão geral das worktrees**: painel largo, agrupado por repositório, com nome, branch, status do Orca, em foco no Orca, não lido, issue/PR/comentário, terminais ativos, última atividade, o estado do PI do Studio (quando a worktree é um projeto conhecido) e **cada agente** (trabalhando/pronto/parado/erro/aguardando, título e últimas 2 linhas da mensagem). Filtro por nome, branch ou repositório, `↑`/`↓`/`Enter`/`Esc`; escolher uma worktree fecha o painel e troca a tela principal para ela (mesmo fluxo de abrir o projeto). Atualiza a cada 3 s enquanto aberto.
- **Seguir a worktree ativa do Orca** (desligado por padrão): ao trocar de worktree no Orca, o Studio troca junto; espera se houver texto não enviado ou um diálogo aberto.
- Só usa o comando de leitura `orca worktree ps --json`. Funciona no app desktop (nativo); no Docker a aba mostra "Disponível no app desktop".
- Variáveis: `PI_STUDIO_ORCA_BIN` (executável do orca), `PI_STUDIO_ORCA_BIN_ARGS` (JSON com argumentos antes dos do orca), `PI_STUDIO_ORCA_TIMEOUT_MS` (padrão 5000).

## Segurança

Mantenha local. O PI pode executar shell, editar arquivos e acessar credenciais disponíveis ao processo. No Docker, monte só os diretórios de projeto que você quer expor.

As rotas `/api/*` validam o `Host`, rejeitam `Origin` diferente (Origin ausente é aceito para clientes CLI) e exigem um token aleatório por execução. O token é entregue no HTML servido localmente e enviado no header `X-PI-Studio-Token`; o cookie `HttpOnly; SameSite=Strict` permite autenticar o EventSource sem expor o token na URL. Um `PI_WEB_HOST` fora de loopback imprime um aviso no console. Não exponha o servidor a redes não confiáveis.

## Teste

```bash
cd /Users/j.henrique/.pi/agent/interface
npm test
```

O smoke usa `test/fake-pi-rpc.mjs` para validar servidor, discovery, SSE e fluxo RPC sem chamar modelo real.
