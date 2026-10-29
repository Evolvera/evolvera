# Patches do PI Studio

O código do PI Studio mora em `interface/` no branch `MiguelNevesZane`. O NatiamG instala esse código no commit fixado em `config/studio-source.json` e aplica por cima os patches desta pasta, em ordem de nome. Quem faz isso é `scripts/studio/sync-studio.mjs`, chamado pelo `install.ps1` e pelo `install.sh`.

Regras que o sync confere antes de instalar:

- cada patch é um `git diff` (precisa ter `diff --git`);
- só toca arquivos dentro de `interface/`;
- não cria link simbólico nem submódulo, nem toca arquivo com cara de segredo;
- aplica limpo no commit fixado; se não aplicar, nada é instalado;
- depois dos patches roda o `npm test` do Studio, já com os testes que os patches trazem. Se a primeira rodada falhar, ela é repetida uma vez (um teste do Studio depende de tempo); uma falha que se repete bloqueia a instalação.

Os bytes ficam exatos (`.gitattributes` marca `*.patch` como `-text`), então o `core.autocrlf` do Windows não altera os patches.

## Patches

| Arquivo | O que muda |
|---|---|
| `0001-desempenho-e-orca.patch` | Leitura da lista de processos no Windows com um PowerShell persistente; árvore de conversas sem normalizar caminho por par projeto e sessão, e sem reler sessões paradas a cada 2 s; Orca fechado em cache de 15 s; árvore aceita Orca de até 10 s e lista de processos de até 15 s; Orca consultado a cada 15 s quando só o selo da barra precisa dele. No Orca: coluna do quadro e botão "Abrir PI no Orca" em cada worktree da visão geral. Testes novos em `test/orca-write.test.mjs` e nos arquivos de teste já existentes. |

| `0002-conversa-simples.patch` | Conversa simples por padrão: só respostas e o trabalho em frases curtas ("Mexeu em pix.ts e checkout.ts. Rodou os testes: passaram"), raciocínio e diffs num clique; cada delegação vira uma troca entre agentes (quem pediu, o que voltou, estado, modelo, tempo e custo); painel da direita abre na equipe; paleta VeroNati (preto real, texto grafite, verde sálvia), tipo mínimo de 12px e frases sem travessão. A opção "Detalhes técnicos na conversa" nas configurações volta ao modo antigo. Testes em `test/simple-view.test.mjs`. |

| `0003-vorcaro.patch` | Vorcaro, a inteligência Master (`Alt+V`): resumo persistido de cada sessão dos últimos 7 dias, um PI lateral somente leitura que responde sobre tudo, quadro (aguardando você, fazendo, a fazer, feito) com progresso e avisos, e envio de um pedido como `/goal` com checklist de aceite para a sessão escolhida, só depois do clique, com o estado de cada pedido acompanhado no quadro. Testes em `test/vorcaro.test.mjs`. |

| `0004-ambientes.patch` | Ambientes como na barra lateral do app Claude: você cria um ambiente (nome e, se quiser, uma pasta existente; sem pasta, o Studio cria `PI Ambientes\<nome>` na sua pasta de usuário) e ele vira uma caixa no topo da barra, com as conversas dentro e forks e subagentes aninhados sob a conversa de origem. As pastas que o Studio achou sozinho ficam em "Outras pastas", recolhido. Atalho fixo no topo: "Vorcaro, a inteligência Master". Remover um ambiente nunca apaga a pasta nem as conversas. Testes em `test/ambientes.test.mjs`. |

Medições e método: `docs/studio-orca/desempenho.md`. Conversa simples: `docs/studio-orca/conversa-simples.md`. Vorcaro: `docs/studio-orca/vorcaro.md`. Ambientes: `docs/studio-orca/ambientes.md`.

## Como mudar um patch

1. Extraia o Studio sem os patches: `node scripts/studio/sync-studio.mjs --no-patches --extract-only <pasta>`.
2. Dentro de `<pasta>`, crie um repositório com `core.autocrlf=false` e commite a base.
3. Aplique os patches atuais (`git apply studio-patches/*.patch`), edite e rode `npm test` em `<pasta>/interface`.
4. Gere de novo com `git diff --no-color -- interface > studio-patches/0001-....patch` e confira com `node scripts/studio/sync-studio.mjs --extract-only <outra-pasta>`.

Ao subir o commit fixado em `config/studio-source.json`, os patches precisam aplicar no commit novo. Se o Miguel incorporar uma mudança, o patch correspondente sai daqui.
