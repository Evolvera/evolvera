# PI Studio e Orca: avaliação e decisão

Avaliado em 28/10/2026 neste PC (Windows 11, Node 26.8.1, Orca 1.4.218, PI 1.4.0).

## Resumo

Os dois não competem. O Orca é onde o PI trabalha (worktree, terminal, orquestração); o Studio é uma janela de chat e acompanhamento por cima do PI, e já lê o Orca. Juntar os dois num app só não é possível (o Orca é um produto de terceiros) nem necessário (a ponte Studio → Orca já existe e está testada).

O problema real era outro: o Studio instalado neste PC estava parado em 18/10/2026, metade do tamanho da versão atual, e nada no NatiamG o atualizava. Além disso, o recurso de mandar mensagem a um subagente pelo Studio dependia de uma extensão (`studio-steer`) que não estava instalada.

Decisão: manter os dois, cada um no seu papel, e fazer o NatiamG instalar e atualizar o Studio a partir de um commit fixado, sem copiar o código dele para esta árvore.

## O que cada um faz bem

| | Orca | PI Studio |
|---|---|---|
| Onde o PI roda | terminal do Orca, com a TUI normal do PI | processo próprio (`pi --mode rpc`) por projeto, aberto pelo Studio |
| Worktrees | cria, lista, remove; uma worktree por tarefa | mostra as worktrees do Orca (`orca worktree ps --json`), abre, cria pela aba Tarefas |
| Orquestração | Runs, Tasks, Dispatch, mensagens entre agentes; é a base do `flow-orca` e do `worker-report` | não orquestra; pede subagente em segundo plano ao PI |
| Acompanhar vários PIs | estado do agente por worktree (extensões `orca-agent-status`, `orca-titlebar-spinner`) | estado por conversa (fazendo, aguardando, pronto, parado, erro), "sem atividade há N min", feed de atividade, custo e tokens do dia |
| Conversa | terminal | chat com markdown, anexos, editar e tentar de novo (fork), busca em todas as conversas, exportar HTML |
| Tarefas | tarefas da orquestração | painel da lista `todo` com responsável, tempo, rodar em paralelo, rodar numa worktree, mensagem ao subagente |
| Extras | navegador, editor, emulador, automações, contas | navegador de arquivos do projeto, voz local (faster-whisper), PI lateral só leitura para tirar dúvidas |
| Onde mora o código | app instalado, fora do repositório | `interface/` no branch `MiguelNevesZane` (cerca de 20 mil linhas, 30 arquivos de teste) |

## Onde se sobrepõem

Os dois mostram "qual worktree está rodando e qual terminou". O Orca sabe dos PIs que rodam nos terminais dele; o Studio sabe dos PIs que ele abriu e lê o resumo do Orca para os outros. O histórico é o mesmo (`~/.pi/agent/sessions`), então uma conversa feita no terminal do Orca aparece na barra lateral do Studio e pode ser continuada lá.

## Lacunas encontradas

1. **Studio parado no tempo.** A cópia em `~/.pi/agent/studio` era de 18/10 (server.mjs com 1.409 linhas; a atual tem 2.671 e precisa de `lib-server/` e `voice/`, que a cópia não tinha). O atalho da Área de Trabalho abria essa versão. O `install.ps1` do NatiamG não toca no Studio, porque o main ignora `/interface/` de propósito.
2. **`/steer` ausente.** A aba Tarefas do Studio manda `/steer <agente> <mensagem>` ao PI principal. Sem `extensions/studio-steer.ts`, o PI recebia isso como texto comum para o modelo. O pi-subagents 0.18.2 instalado expõe o `getRecord` que a extensão usa, então ela funciona com a versão atual.
3. **`run-tests.mjs` sempre vermelho.** O runner (herdado do main) roda `npm test` em `interface/`, que não existe nesta árvore, e contava isso como falha.
4. **Voz exige Python 3.14.** O Studio chama `py -3.14` no Windows; este PC tem só o 3.12. Sem `PI_STUDIO_PYTHON` apontando para um Python com `faster-whisper`, o microfone não funciona. O teste dessa parte também falha por ambiente.
5. **Orca fechado = aba vazia.** Com o app Orca fechado, `orca worktree ps` falha e o Studio mostra o Orca como indisponível. É o comportamento certo; só vale saber que a aba Worktrees depende do Orca aberto.

## O que se ganha e o que se perde

- **Só Orca:** orquestração completa e PIs nos terminais, que é o fluxo das regras de Orca Workers no `config/SYSTEM.md`. Perde a leitura confortável das conversas, a busca, o custo do dia, o aviso de PI travado e o painel de tarefas.
- **Só Studio:** chat confortável e acompanhamento, mas sem Runs, sem `worker-report` e sem as worktrees com terminal; o `flow-orca` não funciona sem o Orca.
- **Os dois (recomendado):** o Orca continua sendo onde se coordena e onde os workers rodam; o Studio fica aberto ao lado para ler, buscar, acompanhar e responder, inclusive conversas que começaram no Orca. Custo: um servidor Node local a mais (porta 4123) e um PI por projeto aberto no Studio (o próprio Studio encerra os ociosos).

## Por que não trazer `interface/` para o NatiamG

- O main exclui `/interface/` como produto fora da distribuição; copiar 20 mil linhas criaria um terceiro lugar com o mesmo código, e a cópia ficaria velha do mesmo jeito que a instalada ficou.
- Quem mantém o Studio é o branch `MiguelNevesZane`, que muda com frequência (último commit em `interface/`: 21/10).
- Esse branch tem um segredo commitado em `config/jev/api_key`; trazer o branch inteiro está fora de questão. Puxar só `interface/` por arquivo resolve isso.

## O que foi feito

1. `config/studio-source.json`: fixa o Studio em `origin/MiguelNevesZane` no commit `a3a9e74` (o mais recente).
2. `scripts/studio/sync-studio.mjs`: instala ou atualiza o Studio daquele commit.
   - Lê do git só `interface/` (e `install.ps1`/`install.sh` do mesmo commit, que os testes do Studio leem). Para tudo se aparecer arquivo com cara de segredo, link simbólico ou submódulo.
   - Busca no remoto só quando o commit não existe localmente.
   - Roda o `npm test` do Studio antes de trocar a cópia instalada; se falhar, nada muda. Sem o Python 3.14, pula só o teste das DLLs NVIDIA da voz e avisa.
   - A troca é atômica (instalador do próprio Studio). Grava `~/.pi/agent/studio/.source.json` com o commit instalado e recria `bin\pi-studio.cmd`.
   - Não derruba um Studio aberto: avisa e só para com `--restart` (que encerra os PIs abertos por ele).
   - `--latest` instala a ponta do branch e imprime o SHA para fixar; `--shortcuts` cria os atalhos; `--skip-tests` existe, mas não é usado pelos instaladores.
3. `install.ps1` (`-Studio`) e `install.sh` (`EVOLVERA_STUDIO=1`): instalam o Studio quando pedido e o atualizam sempre que ele já estiver instalado. Falha no Studio vira aviso; o PI segue instalado.
4. `extensions/studio-steer.ts` e o teste dela, trazidos do branch do Miguel sem mudança.
5. `scripts/run-tests.mjs`: com `interface/` ausente, a suíte do Studio aparece como excluída (com o motivo), não como falha. Os dois testes novos estão classificados.

## Testes

- `npm test` do Studio no commit fixado, rodado pelo sync numa pasta PI descartável: 637 aprovados, 0 falhas. Ficaram de fora o teste da voz (sem Python 3.14) e os 2 que o próprio Studio pula no Windows (lançador do macOS e o wrapper do Git Bash do Docker).
- O Studio instalado por esse caminho subiu numa porta separada e respondeu `/api/health`, `/api/projects` e `/api/orca` (Orca indisponível, porque o app estava fechado).
- `scripts/test/sync-studio.smoke.mjs`: repositórios git sintéticos; prova a busca do commit no remoto, que só `interface/` e os instaladores saem do git, que `config/jev/api_key` nunca sai e que um `.env` dentro de `interface/` bloqueia tudo.
- `extensions/test/studio-steer.smoke.mjs`: passa.
- `node scripts/run-tests.mjs` neste PC: 54 aprovados, 13 falhas, 2 excluídos (um deles a suíte do Studio, agora com motivo). As 13 falhas já existiam: as mesmas 12 falham numa cópia limpa do commit de partida (`9813314`), e `patch-ultra-thinking` estoura o limite de 30 s. A maioria vem de fixtures gravados com CRLF pelo `core.autocrlf=true` do Windows (por exemplo, o stub de `pi` do `install-sh.smoke`), então o `install-sh.smoke` não serve para validar a mudança no `install.sh`; ela foi conferida com `bash -n`.

## Como usar

Atualizar o Studio deste PC agora (fecha o Studio aberto):

```powershell
node scripts\studio\sync-studio.mjs --restart
```

Ou só rodar o `install.ps1` de novo: como o Studio já está instalado, ele é atualizado no fim.

Subir a versão do Studio: `node scripts\studio\sync-studio.mjs --latest`, conferir, gravar o SHA impresso em `config/studio-source.json` e commitar.

Ligar a voz com o Python 3.12 deste PC: instalar `faster-whisper` nele e definir `PI_STUDIO_PYTHON` com o caminho do `python.exe` antes de abrir o Studio.

## Segunda rodada (desempenho e Orca no Studio)

Medições de CPU e RAM, as correções e os controles do Orca dentro do Studio estão em [desempenho.md](desempenho.md). As mudanças no Studio vão como patch em `studio-patches/`, aplicado pelo `sync-studio` sobre o commit fixado.

## Fica para depois

- Pedir ao Miguel que o teste de voz respeite `PI_STUDIO_PYTHON` (hoje ele chama `py -3.14` fixo).
- O Studio lista como projeto toda pasta que já teve sessão de PI, inclusive as pastas de benchmark em `D:\natia\Desktop\evolvera-bench\runs`; se incomodar, `PI_PROJECT_ROOTS` limita as raízes, mas as pastas do histórico continuam aparecendo.
