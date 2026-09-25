# Mapa do projeto — Evolvera PI

## Referência

- Commit-base: `eeae1de` (`NatiamG`), data `2026-09-24` (`git show -s --format=%cs eeae1de`).
- Checkout consultado: `git rev-parse --short=7 HEAD` → `eeae1de`.
- Stack principal: harness do PI Coding Agent, extensões TypeScript e PI Studio
  standalone em Node.js (`README.md:1-3`, `interface/package.json:1-12`).

## Diretórios

- `agents/`: definições de subagentes (`README.md:273`); os instaladores copiam
  os Markdown para `~/.pi/agent/agents` (`install.sh:84-87`, `install.ps1:126-136`).
- `skills/`: procedimentos/workflows (`README.md:274`); instalados por pasta em
  `~/.pi/agent/skills` (`install.sh:89-96`, `install.ps1:140-152`).
- `extensions/`: código PI de comandos, ferramentas e hooks (`README.md:275`);
  instaladores copiam arquivos `.ts` do nível raiz, não Plastic Memory
  (`install.sh:106-120`, `install.ps1:154-178`).
- `config/`: política, configuração, modelos e MCP (`README.md:272-280`);
  arquivos selecionados são instalados na raiz do runtime (`install.sh:64-82`,
  `install.ps1:99-124`).
- `scripts/`: setup auxiliar e patchers do PI; os instaladores chamam patchers e
  configurações de suporte (`install.sh:47-50,69-81,146-165`).
- `interface/`: PI Studio web standalone (`interface/README.md:1-3`).
- `themes/`: temas JSON instalados no runtime (`install.sh:80-81`,
  `install.ps1:119-123`).
- `docs/`: documentação versionada; este mapa fica em `docs/copy-thief/`.
- `ENGINEERING.md`: padrões de engenharia (`ENGINEERING.md:1-21`);
  `README.md` documenta setup e uso (`README.md:1-15`).
- `subagents.json`: limite/configuração de subagentes, instalado na raiz do
  runtime (`README.md:279`, `install.sh:80`, `install.ps1:113-117`).
- `SYSTEM.md`, `models.json`, `mcp.json`, `alibaba-config.json`, `prompts/`,
  `research/` e `templates/`: itens top-level presentes no checkout
  (`find . -maxdepth 1 -mindepth 1 -printf '%f\n' | sort`); papel específico
  dos itens sem documentação citada aqui: não verificado.
- `.pi/` e `.scout/`: diretórios locais presentes no checkout (mesmo comando de
  listagem); `.pi/recovery/` e `.pi/build/` contêm material em remoção pela
  issue #13 (inventário: `find .pi/recovery .pi/build -mindepth 1 -maxdepth 1
  -type d`). Não confundir artefatos de projeto com os arquivos instalados.

## Instalação → `~/.pi/agent`

- `install.sh` e `install.ps1` são os instaladores Linux/macOS e Windows.
  Criam diretórios do runtime e copiam configurações selecionadas, agentes,
  skills, extensões flat, temas e `settings.json` por último
  (`install.sh:54-82,84-121,168-174`; `install.ps1:84-124,126-178,250-255`).
- `config/mcp.json` só é copiado quando o destino `~/.pi/agent/mcp.json` ainda
  não existe: `install.sh:123-139`; `install.ps1:180-197`.
- `install.sh` ignora falhas de vários `pi install` por `|| true`
  (`install.sh:141-150`); risco aberto: #12.
- `extensions/plastic-memory/` e `extensions/project-memory.ts` não são
  instalados pelos scripts enquanto a rota de compactação estiver desativada
  (`install.sh:117-120`; `install.ps1:174-178`).
- Os instaladores exigem Node `>=22.19.0` (`install.sh:36-43`,
  `install.ps1:8-9,39-44`).

## Extensões

Responsabilidade resumida pelos hooks, comandos ou ferramentas registrados em
cada arquivo (evidência apontada por arquivo:linha):

- `anthropic-context-limit.ts`: limita janela Anthropic na seleção/sessão
  (`extensions/anthropic-context-limit.ts:18-26`).
- `auto-image-clipboard.ts`: transforma caminhos de imagem do clipboard em
  anexos de entrada (`extensions/auto-image-clipboard.ts:7-20`).
- `codex-fast-mode.ts`: comando `/fast` e ajuste do tier de requisições
  (`extensions/codex-fast-mode.ts:112-120,193-210`).
- `communication-style.ts`: comando e injeção do modo de comunicação
  (`extensions/communication-style.ts:98-108,146-159`).
- `execution-mode.ts`: comando e injeção/persistência do modo de execução
  (`extensions/execution-mode.ts:193-207,259-279`).
- `jina-reader.ts`: ferramenta `jina_read` para ler páginas/PDFs
  (`extensions/jina-reader.ts:1-13,59-66`).
- `maestro.ts`: classifica prompt e seleciona rota/modelo
  (`extensions/maestro.ts:224-245,354-375`).
- `native-compaction-routing.ts`: roteia compactação nativa
  (`extensions/native-compaction-routing.ts:1-6,125`).
- `pi-tool-expert-helper.ts`: ferramentas de inspeção/validação do ambiente PI
  (`extensions/pi-tool-expert-helper.ts:1-12,16-23,89-95,171-179,229-238`).
- `project-memory.ts`: bridge context-only de contexto de projeto
  (`extensions/project-memory.ts:1-4,20-29`).
- `qwen-context-limit.ts`: limita janela do modelo Qwen configurado
  (`extensions/qwen-context-limit.ts:20-28`).
- `subagent-watchdog.ts`: monitora chamadas de subagentes e timeout do planner
  (`extensions/subagent-watchdog.ts:144-169`).
- `user-attention-notifier.ts`: notifica fim/atenção e oferece `/attention`
  (`extensions/user-attention-notifier.ts:51-80`).
- `working-time.ts`: exibe duração do turno em andamento
  (`extensions/working-time.ts:66-80`).
- `plastic-memory/`: sistema de memória com hook de contexto e runtime próprio;
  diretório não instalado por padrão (`extensions/plastic-memory/index.ts:1-8,121`;
  `install.sh:117-120`).

## Agentes e skills

- 32 arquivos de agente e 28 `SKILL.md` no checkout, conforme
  `find agents -maxdepth 1 -type f -name '*.md' | wc -l` e
  `find skills -mindepth 2 -maxdepth 2 -name SKILL.md | wc -l`.
- Consulte `agents/` e `skills/`; papéis e uso de cada tipo estão em
  `README.md:270-291`. As definições são instaladas em
  `~/.pi/agent/agents` e `~/.pi/agent/skills` (`install.sh:84-96`).

## Testes

- Smokes individuais: `node <arquivo>` para `extensions/test/*.smoke.mjs` e
  `scripts/test/*.smoke.mjs` (inventário verificável com
  `find extensions/test scripts/test -maxdepth 1 -type f -name '*.smoke.mjs'`).
- Copy Thief: `node --test skills/copy-thief/scripts/test/ct.test.mjs`
  (arquivo `skills/copy-thief/scripts/test/ct.test.mjs`).
- PI Studio: `(cd interface && npm test)`; o script roda verificações de sintaxe
  e `test/smoke.mjs` (`interface/package.json:7-10`).
- Runner único `node scripts/run-tests.mjs`: previsto após issue #6; não
  encontrado no checkout consultado (`find scripts -maxdepth 2 -type f`).

## Fluxos

- CLI PI: instalação → `pi` → `/login`; após mudanças em agents, skills,
  extensions ou configuração, `/reload` (`README.md:50-58,223-226`).
- PI principal escolhe ação direta ou delegação a agente especializado e
  valida o resultado (`README.md:3-13,293-313`).
- PI Studio: servidor HTTP local default `127.0.0.1:4123`
  (`interface/server.mjs:12-16`); abrir projeto cria/recupera sessão PI RPC,
  com processo `pi --mode rpc` no diretório do projeto
  (`interface/server.mjs:283-312,623-637`); UI usa projetos, SSE e comandos
  (`interface/public/app.js:243-290`). Detalhes de execução em
  `interface/README.md:5-23,44-52`.

## Integrações

- MCP: `config/mcp.json` tem `mcpServers` vazio (`config/mcp.json:1-3`);
  instaladores preservam MCP já existente (`install.sh:123-139`,
  `install.ps1:180-197`).
- GitHub/`gh`: pré-requisito/opção de clone documentado em
  `README.md:17-24,50-52`; fluxo de issues usa GitHub e Flow Orca
  (`README.md:394-412`).
- Orca: skill `flow-orca` coordena workspaces/sessões; campanha não é descrita
  aqui como execução live (`README.md:394-412`).
- Provedores/modelos: catálogo em `config/models.json`; provider/modelo default
  em `config/settings.json:4-6`. Packages instalados incluem adaptadores para
  Anthropic, Alibaba e Kimi (Windows), além de subagents e Goal Mode
  (`install.sh:144-165`; `install.ps1:204-247`).

## Riscos conhecidos

Issues reportadas como abertas no board/contexto desta issue; confirme o estado
antes de agir:

- aberto: #7 — PI Studio aceita qualquer Host/Origin nas rotas `/api`
  (`interface/server.mjs:572-576`).
- aberto: #8 — `serveStatic` não confina `public/` por componente
  (`interface/server.mjs:542-547`).
- aberto: #9 — UI não sinaliza quando o processo PI encerra; o servidor publica
  `process_exit`, mas o cliente registra `process_error`
  (`interface/server.mjs:322-328`; `interface/public/app.js:276-282`).
- aberto: #10 — Esc no diálogo pode deixar pedido PI sem resposta
  (`interface/public/app.js:445-455`).
- aberto: #12 — `install.sh` oculta falha de alguns `pi install`
  (`install.sh:144-150`).
- aberto: #14 — backfill para após 8 janelas; execução processa uma janela por
  chamada (`extensions/plastic-memory/session/backfill.ts:187-199`).
- aberto: #20 — relato do board diz que scout recebe ferramenta `mcp` completa;
  frontmatter atual lista apenas read, grep, find e ls
  (`agents/scout.md:1-8`), portanto o detalhe não está confirmado neste checkout.
- Em remoção pela #13: backups/artefatos sob `.pi/recovery/` e `.pi/build/`
  (inventário: `find .pi/recovery .pi/build -mindepth 1 -maxdepth 1 -type d`).

## Como atualizar este mapa

1. Reconfira o commit-base e a árvore: `git rev-parse --short=7 HEAD`,
   `git show -s --format=%cs <sha>` e `find . -maxdepth 1 -mindepth 1`.
2. Leia instaladores, entrypoints e arquivos que sustentam cada afirmação;
   atualize as referências `arquivo:linha` junto do texto.
3. Refaça contagens/inventários com os comandos desta página; riscos/issues
   precisam ser conferidos no board, não inferidos do código.
4. Valide referências citadas e atualize o commit-base quando uma nova varredura
   for feita (`docs/copy-thief/mapa-do-projeto.md`, seção Referência).
