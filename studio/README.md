# PI Studio (código da NatiamG)

O Studio do PI: as conversas por ambiente, o palco dos agentes, o terminal e o checklist ao lado, e o Vorcaro, a inteligência Master. Nasceu do Studio do Miguel (commit `a3a9e74` do branch `MiguelNevesZane`) e desde 29/10/2026 é código desta branch. O que mudou até lá está em [HISTORICO.md](HISTORICO.md).

## Onde fica cada coisa

| Pasta | O quê |
|---|---|
| `interface/server.mjs` | Servidor local (porta 4123, com token), sessões do PI, rotas da API |
| `interface/lib-server/` | Vorcaro (`vorcaro.mjs`, condutor, espelhos do Orca e do GitHub), árvore, processos, voz |
| `interface/public/` | Tela: `index.html`, `app.js`, `vorcaro.js`, `styles.css` |
| `interface/desktop/` | Atalho, ícone e instalador da cópia em `~/.pi/agent/studio` |
| `interface/test/` | Testes (`npm test` dentro de `interface/`) |
| `install.ps1`, `install.sh` | Instaladores próprios do Studio, que alguns testes leem |

## Mudar e instalar

1. Edite os arquivos aqui e rode os testes: `cd studio/interface` e `npm test`.
2. Instale no PC: `node scripts/studio/sync-studio.mjs` (o `install.ps1` da raiz também chama). Ele copia esta pasta para uma área temporária, roda o `npm test` e só então troca a cópia instalada.
3. Para trocar um Studio que já está aberto: acrescente `--restart` (encerra os PIs abertos pelo Studio).

O instalador para tudo se achar arquivo com cara de segredo (`.env`, `auth.json`, chave privada, `config/jev`) ou link simbólico nesta pasta.

## Dados da pessoa, fora do código

Ficam em `~/.pi/agent/pi-studio-data/` e nunca entram no repositório: `vorcaro-foto.png` (a foto do Vorcaro), `studio-icone.ico` (ícone do atalho), `vorcaro-config.json` (Orca, GitHub Projects e `"claudeCode": false` para o Studio não ler as sessões do Claude Code), `vorcaro-ignorar.json` (pastas que somem da lateral e do Vorcaro), demandas, arquivo e conversas do Vorcaro.
