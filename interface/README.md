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

## Windows (app de janela própria)

```powershell
powershell -ExecutionPolicy Bypass -File interfacestart-windows.ps1
```

Sobe o servidor oculto (se ainda não estiver na porta 4123) e abre o Edge/Chrome em modo `--app`. No Windows o servidor encontra o `cli.js` global do PI sozinho (ou use `PI_WEB_PI_BIN`) e lista os projetos que já têm sessões em `~/.pi/agent/sessions`, os mais recentes primeiro.

## Rodar no Docker

```bash
cd /Users/j.henrique/.pi/agent/interface
PI_WORKSPACES_DIR="$HOME" docker compose up --build
# http://127.0.0.1:4123
```

O Docker monta:

- `${PI_WORKSPACES_DIR:-$HOME}` em `/workspaces` para descobrir projetos;
- `${HOME}/.pi/agent` em `/root/.pi/agent` para reutilizar auth, settings, agents, skills e sessões.

Se algum pacote PI montado do host não carregar dentro do Linux do container, rode:

```bash
docker compose exec pi-studio pi update
```

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
