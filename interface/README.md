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

## Segurança

Mantenha local. O PI pode executar shell, editar arquivos e acessar credenciais disponíveis ao processo. No Docker, monte só os diretórios de projeto que você quer expor.

As rotas `/api/*` validam o `Host`, rejeitam `Origin` diferente (Origin ausente é aceito para clientes CLI) e exigem um token aleatório por execução. O token é entregue no HTML servido localmente e enviado no header `X-PI-Studio-Token`; o cookie `HttpOnly; SameSite=Strict` permite autenticar o EventSource sem expor o token na URL. Um `PI_WEB_HOST` fora de loopback imprime um aviso no console. Não exponha o servidor a redes não confiáveis.

## Teste

```bash
cd /Users/j.henrique/.pi/agent/interface
npm test
```

O smoke usa `test/fake-pi-rpc.mjs` para validar servidor, discovery, SSE e fluxo RPC sem chamar modelo real.
