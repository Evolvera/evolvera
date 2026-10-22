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

## Visibilidade (atividade, travado, tempos, erros, custo)

- **Atividade**: o servidor guarda em memória os últimos 300 eventos notáveis de todos os PIs (resposta terminada com duração, subagente iniciado/terminou com duração e ok/erro — em segundo plano, pela notificação do subagente —, erro, nova tentativa, compactação, diálogo aguardando/respondido, PI encerrado). `GET /api/activity?since=<seq>` devolve `{ items, seq, reset, now }` (`reset` quando o cursor é maior que o último seq, ou seja, o servidor reiniciou; `since` inválido = 400). Na UI: botão Worktrees (`Alt+W`) → controle **Worktrees | Atividade** (também "Ver atividade" no `Ctrl+K`, mesmo sem Orca). Cada linha mostra tempo relativo, projeto e texto; filtro por projeto/texto; clicar abre o projeto. O selo "Atividade" conta o que chegou desde a última vez que a visão foi aberta.
- **Travado?**: um PI respondendo sem nenhum evento há mais de 3 min, ou um subagente em primeiro plano sem progresso há mais de 5 min, aparece como "sem atividade há N min" (ponto âmbar) na barra lateral, no cartão do subagente e na visão geral das worktrees. Um PI esperando sua resposta não conta. Os limites são constantes em `public/lib.js`; `PI_STUDIO_STALL_PI_MS` e `PI_STUDIO_STALL_SUBAGENT_MS` (inteiros positivos, em ms) os substituem (testes). Subagentes em segundo plano não emitem progresso e por isso não são marcados.
- **Subagentes**: o cartão mostra "rodando há Y" ou "terminou há X · levou Y". O horário de término vem do fim da ferramenta, da notificação ou do registro persistido; sem ele, só "levou Y".
- **Erros e tentativas**: aba Contexto → "Erros e tentativas" lista, desta conversa, erros do modelo, tentativas automáticas (n/máx e erro final), erros de extensão, falhas de compactação e falhas do processo.
- **Custo**: aba Contexto → "Hoje": custo, tokens e nº de sessões do dia (data local da mensagem) somados em todos os projetos (`GET /api/usage/today` → `{ cost, tokens, sessions, indexing }`). Vem do índice de sessões (cache por mtime e tamanho; lê no máximo os primeiros 5 MiB de cada sessão). Sem custo nas mensagens, mostra só tokens (`cost: null`).
- **Contagem na barra lateral**: `GET /api/projects/status` também devolve `runningCounts` (`{ projectId: n }`): conversas de cada projeto, sub-PIs incluídos, cujo arquivo mudou nos últimos 30 min e termina em execução ("fazendo"). Só esses arquivos têm o final lido; o resultado é cacheado por 2 s. É o que mantém o selo de projetos que não estão abertos. A mesma resposta traz `now` (relógio do servidor) e `stall` (limites).
- Fora de escopo: parar um único subagente (o RPC só tem `abort` global), status de PR/CI e estado git sujo.

## Navegador (aba do Inspetor)

- Abre ao lado da conversa: arquivos do projeto (imagem, PDF, HTML, Markdown, texto/código, áudio/vídeo; outros mostram tamanho e "Abrir fora"), `http://localhost:*` e páginas `https` (se o site não permitir ser emoldurado, aparece um cartão com "Abrir fora"; nada passa por proxy). Entradas: clique em um arquivo em Arquivos, caminhos e `http://localhost…` nas mensagens (Ctrl/Cmd+clique abre fora), `@` + Alt+Enter, Ctrl+K "Abrir no navegador…". Últimos 20 destinos por projeto (voltar/avançar) no `localStorage`.
- `GET /api/projects/:id/file?path=…` (token + Origin como as demais rotas) resolve o caminho real e recusa o que sai da raiz do projeto (`..`, outra unidade, link simbólico ou junção que escapa): 403; 404 se não existe; 413 acima de 20 MB. `?info=1` devolve o descritor (tipo, tamanho e a URL de leitura).
- **Página isolada do Studio**: o HTML aberto roda em `<iframe sandbox="allow-scripts allow-forms">` (sem `allow-same-origin`, origem opaca: sem `localStorage`, cookie, token nem acesso ao Studio) e todo arquivo sai com `Content-Security-Policy: sandbox` e `X-Content-Type-Options: nosniff`. Como esse frame não leva o token, ele lê por `/api/projects/:id/raw/<cap>/<caminho>`, em que `<cap>` é um HMAC (derivado do token da execução) só de leitura e só deste projeto; assim `style.css` e `app.js` relativos funcionam. Essa é a única rota que aceita `Origin: null`; o caminho passa pela mesma resolução e pelas mesmas recusas.
- `localhost` de outra porta carrega em frame com `allow-same-origin` (é outra origem); o endereço do próprio Studio nunca abre aqui.

## Transcrição local

A transcrição usa `faster-whisper` local e não envia áudio a serviços externos. No Windows, se o CUDA local falhar por DLLs NVIDIA ausentes, instale os wheels oficiais NVIDIA no mesmo Python usado pelo Studio (por padrão, Python 3.14):

```powershell
py -3.14 -m pip install nvidia-cublas-cu12==12.4.5.8 nvidia-cudnn-cu12==9.1.1.17
```

O worker localiza os diretórios `nvidia/cublas/bin` e `nvidia/cudnn/bin` pelos metadados desses pacotes e os registra no `PATH`/carregador de DLL somente para o próprio processo, antes de importar o Whisper. Não é necessário alterar o `PATH` do Windows. Sem os pacotes, a transcrição continua disponível pelo fallback local de CPU.

## Segurança

Mantenha local. O PI pode executar shell, editar arquivos e acessar credenciais disponíveis ao processo. No Docker, monte só os diretórios de projeto que você quer expor.

As rotas `/api/*` validam o `Host`, rejeitam `Origin` diferente (Origin ausente é aceito para clientes CLI) e exigem um token aleatório por execução. O token é entregue no HTML servido localmente e enviado no header `X-PI-Studio-Token`; o cookie `HttpOnly; SameSite=Strict` permite autenticar o EventSource sem expor o token na URL. Um `PI_WEB_HOST` fora de loopback imprime um aviso no console. Não exponha o servidor a redes não confiáveis.

## Teste

```bash
cd /Users/j.henrique/.pi/agent/interface
npm test
```

O smoke usa `test/fake-pi-rpc.mjs` para validar servidor, discovery, SSE e fluxo RPC sem chamar modelo real.

## Tarefas

A aba **Tarefas** do inspetor mostra a lista de tarefas (`todo`) da conversa aberta: ícone de estado, responsável (subagente, worktree do Orca, nome informado pelo PI ou "PI principal"), tempo ("rodando há 3 min", "levou 5 min", "aguardando", "bloqueada") e o selo com o número de tarefas executando agora. Os horários são carimbados pelo Studio e guardados por conversa no navegador (limitados); ao recarregar, são refeitos a partir das mensagens.

- **Responsável**: clicar num subagente abre a conversa dele em modo de acompanhamento (o vínculo vem do nome da sessão `<agente>#<id>`); enquanto roda, a caixa de mensagem vira "Mensagem para <agente>" e envia `/steer` ao PI principal (extensão `extensions/studio-steer.ts`). Clicar numa worktree abre a conversa dela; em "PI principal", rola a conversa até o fim.
- **Rodar em paralelo**: pede ao PI, como mensagem normal (fila de follow-up se ele estiver respondendo), um subagente em segundo plano para aquela tarefa.
- **Rodar numa worktree** (só com o Orca disponível): diálogo com nome e prompt preenchidos; cria a worktree pelo `POST /api/orca/worktrees`. "Esta pasta não está no Orca" desabilita o botão; se o resultado não puder ser confirmado, o Studio avisa para conferir no Orca.
- **Mensagem**: campo de uma linha sob a tarefa (Enter envia, Esc fecha) para o subagente em execução (`/steer`) ou para o terminal da worktree (`POST /api/orca/terminal-send`); sem terminal identificado o botão fica desabilitado.
- As abas do inspetor mostram ícone + texto se couberem; senão só a aba selecionada mantém o texto; senão só ícones. Nomes de agentes aparecem sem emoji, com um ícone de linha por família; os pontos de estado levam `data-state`.
