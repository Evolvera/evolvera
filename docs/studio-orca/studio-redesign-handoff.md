# Handoff: redesign do PI Studio (palco de agentes) e Vorcaro v1

Escrito pela sessão natiamg-studio-orca-4174a0 para a sessão que fizer o redesign. Comece do NatiamG depois do merge da branch `claude/natiamg-studio-orca-4174a0` (patches 0001 a 0004 em `studio-patches/`).

## Como o Studio é entregue (não edite interface/ no repo)

- O código do Studio está no branch MiguelNevesZane (`interface/`), fixado no commit `a3a9e74` em `config/studio-source.json`.
- As mudanças do NatiamG são patches em `studio-patches/` (0001 desempenho+Orca, 0002 conversa simples, 0003 Vorcaro), aplicados por `scripts/studio/sync-studio.mjs` depois da extração e antes do `npm test` do Studio. Regras e fluxo de edição em `studio-patches/README.md`.
- Fluxo de trabalho que usei:
  1. `node scripts/studio/sync-studio.mjs --no-patches --extract-only <dev>`; em `<dev>`: `git init`, `git config core.autocrlf false`, commit "base".
  2. `git apply` de cada patch em ordem (0001 a 0004), um commit por patch (assim dá para gerar o próximo com `git diff HEAD~1`).
  3. Editar em `<dev>/interface`, testar com `NODE_OPTIONS=--test-skip-pattern=NVIDIA npm test` (o teste da voz exige py -3.14, ausente aqui).
  4. Gerar o patch novo `git diff --no-color HEAD~1 HEAD -- interface > studio-patches/000N-....patch` e conferir com `node scripts/studio/sync-studio.mjs --extract-only <outra>` + `diff -r` (tem que dar idêntico).
- Cuidado no Windows: o heredoc do Bash do Claude estraga barras invertidas e crases; use Write/Edit para scripts com template strings. `core.autocrlf=true` global: o sync já aplica patches com autocrlf=false.

## Ferramentas prontas (`docs/studio-orca/studio-tools/` neste repositório)

- `shots-server.mjs <pasta interface>`: sobe o Studio na porta 4198 com dados 100% sintéticos (3 projetos, sessões, uma conversa rica com raciocínio, scout, edição com diff, npm test, builder rodando, todo e goal-state; Orca falso com 3 worktrees; `FAKE_PI_REPLY_FILE` com uma resposta do Vorcaro). Para abrir a conversa rica no navegador: clicar em outra conversa e depois em "Checkout com Pix" (vira modo acompanhamento, lê o JSONL).
- `scripts/studio/bench-studio.mjs` (no repo): medição de CPU/RAM por fase. Use `--direct-ps` para o leitor persistente.
- `prof-drive.mjs` + `prof-steady.cjs`: perfil de CPU do servidor com a interface aberta (análise a partir de N segundos).
- Capturas: Playwright MCP (`browser_resize` 1440x900, `browser_take_screenshot` com filename em docs/studio-orca/). O arquivo às vezes aparece com atraso; confira com `ls` antes de ler.

## O que já existe e deve ser dobrado no redesign

- `public/simple-view.js`: linha do tempo simples (`simplifyTimeline`, `humanWork`, `agentExchange`). Pode virar a base do chat central "só saídas".
- `public/vorcaro.js` + `lib-server/vorcaro.mjs`: resumos persistidos, quadro, propostas editáveis, envio por /goal após clique. O endpoint `/api/vorcaro/board` já dá colunas, avisos e pedidos com estado.
- Paleta VeroNati já nos tokens de `public/styles.css` (preto real, sálvia #7cc4a0, `--ease-vero`). Só tema escuro; o claro falta.
- Dados de equipe (team-bus, NatiamG 5e50740): `~/.pi/agent/teams/<team>/members/*.json`, `messages.jsonl`, `logs/<name>.jsonl`. Fixtures: `~/.pi/agent/teams/s-*` e `D:\natia\Desktop\evolvera-bench\runs\team\large-genesis-demandas-lista\*.events.jsonl`. Nenhuma rota do Studio lê isso ainda.

## Regras que aprendi aqui

- Nunca pare processos por "criados depois de X" ou por regex ampla: há várias sessões e benchmarks rodando neste PC. Só PIDs que você mesmo iniciou (porta 4198/4199 → confira a linha de comando antes de parar).
- Não suba o Orca (`orca serve`/`open`) sem aval explícito; com ele fechado, use só a superfície já verificada (worktree ps/create/set, terminal create/send).
- O teste "real server: an idle unwatched Studio PI is stopped" do Miguel é instável sob carga; o sync repete o npm test uma vez.
- Não edite config/SYSTEM.md, SYSTEM.md, agents/*.md, extensions/provider-login-check.ts.

## Pedidos em aberto (da sessão coordenadora)

1. Redesign completo (prioridade): palco de agentes acima/ao redor do chat central (nó por agente, estado, arquivo atual, tempo, custo; arestas animando mensagens e entregas; equipe como árvore lead → filhos via team-bus), workbench à direita (Terminal, Worktrees, Checklist/Kanban, Contexto), visual técnico-futurista VeroNati, Plus Jakarta Sans + mono servidas localmente, tema claro e escuro, capturas 1440x900 e 1366x768 nos dois temas e uma de equipe.
2. Vorcaro v1 (referências em `...48f7ab1a.../scratchpad/bench/vorcaro-referencias.md`, parte "Proposta Vorcaro v1"): verificação própria antes de "feito", continuação curta com orçamento (máx. 2, sem duplicar autopilot), bloqueios tipados, citação de fonte nas respostas, log de auditoria, idle-reaper sem matar sessões de cartões do Vorcaro ou aguardando o usuário.
