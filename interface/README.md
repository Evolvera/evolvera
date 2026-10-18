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
- Atalhos: `Ctrl+/` lista todos, `Ctrl+K` paleta de comandos (ações, projetos, conversas e busca), `Ctrl+Shift+O` nova conversa, Esc interrompe, `↑` no campo vazio recupera a última mensagem, `Alt+T` tarefas.
- Conversas: menu ⋯ (ou clique direito) na conversa ativa para **Renomear** (`set_session_name`; a barra lateral usa o nome salvo) e **Exportar** em HTML (`export_html`, com "Copiar caminho"). Busca por texto em todas as conversas pela lupa da barra lateral ou pelo `Ctrl+K` (`GET /api/search`, sem acento/maiúsculas). O índice incremental em memória limita o texto a 64 KiB por sessão (no máximo 64 KiB × número de sessões, além dos metadados); a indexação inicial ocorre em segundo plano.
- Configurações (engrenagem): tamanho da fonte, largura do chat, notificações, reduzir animações e mostrar raciocínio por padrão; salvas no navegador e aplicadas antes da primeira pintura.

## Segurança

Mantenha local. O PI pode executar shell, editar arquivos e acessar credenciais disponíveis ao processo. No Docker, monte só os diretórios de projeto que você quer expor.

As rotas `/api/*` validam o `Host`, rejeitam `Origin` diferente (Origin ausente é aceito para clientes CLI) e exigem um token aleatório por execução. O token é entregue no HTML servido localmente e enviado no header `X-PI-Studio-Token`; o cookie `HttpOnly; SameSite=Strict` permite autenticar o EventSource sem expor o token na URL. Um `PI_WEB_HOST` fora de loopback imprime um aviso no console. Não exponha o servidor a redes não confiáveis.

## Teste

```bash
cd /Users/j.henrique/.pi/agent/interface
npm test
```

O smoke usa `test/fake-pi-rpc.mjs` para validar servidor, discovery, SSE e fluxo RPC sem chamar modelo real.
