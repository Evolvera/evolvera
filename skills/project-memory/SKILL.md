---
name: project-memory
description: "Memória persistente por projeto com chunks Markdown autoritativos, arquitetura normalizada em JSON e projeções determinísticas injetadas no runtime."
---

=== PROJECT-MEMORY PROTOCOL ===

## LOCALIZAÇÃO
Toda memória de projeto fica em: `{cwd}/.pi/memory/`

> **Nota**: A pasta `.pi/` na raiz do projeto é o diretório padronizado para **todos** os artefatos dos agentes:
> - `.pi/plans/` — planos persistentes (planner, designer, content-writer, polisher)
> - `.pi/build/` — checklists temporários de execução (TILL-DO.md, TODO.md)
> - `.pi/validate/` — artefatos de validação (REVIEW.md, FIX_REQUIRED.md)
> - `.pi/memory/` — memória persistente do projeto (este skill)
> - `.pi/flow/` — cache operacional rebuildable de entrega, de propriedade do skill `flow`
>
> `.pi/memory/` registra contexto e conhecimento genérico; não possui claims nem o estado de entrega do Flow. Para Flow, o estado remoto atual do GitHub sempre prevalece sobre `.pi/flow/`, `.pi/memory/` e contexto de chat. Ausência ou desatualização desses caches nunca autoriza recriar backlog, assumir issue ou sobrescrever estado remoto.

| Arquivo | Descrição |
|---------|-----------|
| `_summary.md` | Resumo humano compacto injetado no contexto (bounded: root 8k). Derivado de chunks canônicos, sem substituir a fonte com full-text de sessão. |
| `setup.md` | Como rodar, buildar, testar, deploy. Scripts, dependências, runtime. |
| `bugs.md` | Bugs conhecidos com status [ATIVO]/[RESOLVIDO]. Workarounds e fixes. |
| `architecture.md` | Narrativa humana durável: padrão, limites, estrutura e lições arquiteturais; não duplica as tabelas normalizadas. |
| `architecture.json` | Fonte de verdade estruturada e normalizada para agentes; registros têm IDs estáveis e evidência exata relativa ao repositório. |
| `architecture.html` | Visão humana self-contained gerada de `architecture.json`; nunca editar manualmente nem usar como autoridade. |
| `env.md` | Variáveis de ambiente obrigatórias e opcionais. Secrets como [REDACTED]. |
| `api-external.md` | APIs de terceiros, rate limits, quirks. |
| `decisions.md` | Decisões técnicas. Decisão + alternativas + motivo. |

---

## REGRA 1 — INÍCIO DE SESSÃO (AUTOMÁTICO VIA EXTENSION)

A extensão `project-memory.ts` e a superfície `plastic-memory` injetam, em `before_agent_start`, um contexto projetado com:
- resumo raiz (bounded 8k),
- índice ativo de chunk (bounded 4k),
- índice opcional de arquitetura (bounded 4k).

Essas projeções são derivadas, não substituem fatos e não implicam varredura completa de projeto.

A memória pode operar em três modos:
- **canonical**: memória canônica com projection surface;
- **legacy-flat**: fallback legado (`_summary.md` + índice legado);
- **uninitialized**: sem memória inicializada.

Compatibilidade operacional: em ambiente legado com `pi-observational-memory` ativo, `project-memory` permanece bridge/context-only e não força corte de propriedade aqui.

Se `.pi/memory/` estiver ausente, não trate ausência como confirmação de projeto novo.

**Exceção Flow:** quando a intenção atual for continuar board/issues/PRs via skill `flow`, a Phase 6 de re-entry remoto do Flow acontece primeiro. Memória ausente não significa projeto novo quando o GitHub já contém board, issues, branches ou PRs. Só depois da reconciliação remota crie/atualize memória, se isso ainda for necessário; nunca deixe memória bloquear retomada do WIP remoto.

---

## REGRA 2 — INICIALIZAÇÃO ALVO (NÃO É RESCAN GLOBAL)

Se `.pi/memory/` não existe no projeto atual:

1. Crie o diretório: `mkdir -p .pi/memory/`.
2. Copie somente os templates necessários (`cp ~/.pi/agent/skills/project-memory/templates/* .pi/memory/`).
3. Para bootstrap explícito, use no máximo **3 scouts em paralelo**, cada um com prompt delimitado (setup, arquitetura/APIs, env/bugs/decisões), apenas para dados faltantes; não imponha leitura integral do repositório.

**Scout A — Setup, Infra & Config:** scripts, dependências, runtime, testes e hooks críticos.

**Scout B — Architecture & APIs:** evidência arquitetural normalizada com IDs e relações, sem inventar fluxos.

**Scout C — Env, Bugs & Decisões:** variáveis de ambiente, decisões técnicas, riscos e inconsistências relevantes.

4. Faça bootstrap pontual com builder/ajuste direto apenas nos arquivos e seções necessárias, por uma publicação canônica explicitamente suportada. No root atualmente verificado, a superfície de publicação/provider não está instalada; as ações de autoridade informam `unavailable`.
5. Atualize projeções derivadas (`_summary.md` e índices) somente como parte dessa publicação canônica explícita e depois dos artefatos-alvo; o runtime pode reconstruir projeções bounded em memória, sem escrever.
6. Não faça rescan global, não reescreva o resumo inteiro de forma autônoma e não sobrescreva arquitetura sem evidência nova.

Se `.pi/memory/` já existe, mas `architecture.json` está ausente:
- não trate o projeto como novo;
- preserve Markdown e o estado remoto do GitHub;
- inicialize arquitetura apenas quando houver mudança material e caminho explícito suportado.

---

## REGRA 3 — MAPA ARQUITETURAL INCREMENTAL (JSON + HTML)

Quando ativo o proprietário plástico, a operação usa os papéis `observer`, `reflector`, `compactor` e `project-promoter` no modelo `openai-codex/gpt-5.6-luna` com `medium`. Os gatilhos 10k/20k são bordas de inspeção, não cadência. Cada ciclo usa um snapshot contíguo de turno concluído, com limite aproximado de 100k tokens; não há multipart: a conclusão é semântica e exata. Há no máximo uma retry automática. A compactação usa identidade: seis ciclos completos formam o stride, compacta os dois mais antigos e preserva os quatro mais recentes. Resultado detached só aplica quando o host está settled/idle, sem mensagens pendentes, e passa as guardas de branch/identity; tentativa interna inválida ou não correspondente cancela, e um no-match manual/threshold/overflow mantém o fallback nativo. Não alegue qualidade live.

Backfill e publicação são operações explícitas: `backfill` começa por relatório sem escrita, usa cursor bounded, uma janela de turno concluído por vez, pausa/retoma e retry explícito; não corre automaticamente. No root atualmente verificado, as ações de autoridade expostas (`propose`, `accept`, `migrate`, `backfill`, `retry`) retornam `unavailable`, pois não há provider-backed worker nem caminho de publicação provider-to-canonical.

Markdown canônico de projeto/chunk continua sendo a autoridade para fatos e lições narrativas humanas. O JSON é uma camada aditiva, normalizada e agent-facing; o HTML é sempre derivado do JSON e nunca é entrada de agentes. A saída de `project-promoter` é somente proposta: aceitação exige evidência atual e um caminho canônico explicitamente suportado; não há publicação autônoma.

Atualize `architecture.json` somente quando houver mudança material em arquitetura, fluxo, evidência ou gap — não a cada edição de código. Antes de mutar:
- Compare `snapshot.sourceHead` com o Git atual; mismatch é `POSSIBLY_STALE`, não prova de erro. Verifique a evidência afetada antes de alterar registros.
- Derive o fechamento dos artefatos afetados a partir dos `evidence.path`/`evidenceIds`; preserve IDs estáveis e registros não afetados.
- Atualize ou remova relações e passos de fluxo atomicamente, para que nenhuma referência fique dangling. Se a fonte não sustenta uma afirmação, marque-a `unknown`/gap `open` em vez de inventar.
- Atualize `sourceHead`, `lastVerifiedAt`, `scope` e confiança conforme a evidência real; não grave status transitório de entrega.

Checkpoint obrigatório: atualizar a narrativa Markdown necessária e o JSON, validar o JSON, renderizar o HTML e só depois atualizar `_summary.md`. Se a validação falhar, não renderize nem aceite HTML; reporte o erro explicitamente. Nunca use o HTML para reconstruir ou substituir o JSON.

Comandos, executados na raiz do projeto e resolvidos relativamente ao diretório desta skill:
```sh
PI_AGENT_DIR="${PI_AGENT_DIR:-$HOME/.pi/agent}"
SKILL_DIR="$PI_AGENT_DIR/skills/project-memory"
node "$SKILL_DIR/scripts/validate-architecture.mjs" .pi/memory/architecture.json
node "$SKILL_DIR/scripts/render-architecture.mjs" .pi/memory/architecture.json .pi/memory/architecture.html
```

## REGRA 4 — SAVE (adicionar nova informação)

Quando descobrir algo novo durante o trabalho:
1. Determine qual arquivo `.md` é o correto e monte o conteúdo da nova entrada.
2. Edite somente a seção necessária; atualize `_summary.md`/índices apenas se o caminho explícito de publicação canônica suportar essa atualização bounded.
3. Mantenha formato consistente: heading + bullets + data + evidência.
4. Não faça varredura ou sobrescrita global sem alteração semântica concreta.

**Quando salvar automaticamente:**
- Bug fix concluído → `bugs.md`
- Incidente de deploy/recovery/rollback confirmado → `bugs.md` + `setup.md`
- Nova feature que altera arquitetura → `architecture.md`
- Mudança em scripts/config → `setup.md`
- Decisão técnica tomada → `decisions.md`
- Descoberta de quirk de API → `api-external.md`
- Mudança em variáveis de ambiente → `env.md`

**Lição operacional mínima:** registre apenas fatos duráveis: sintoma, causa raiz comprovada, suposição errada, sequência correta, pré-requisitos, smoke pós-operação, rollback e arquivos/comandos relevantes. Antes de repetir deploy, migration ou recovery, consulte essa entrada e confirme contra o estado atual. Nunca grave valores secretos, output sensível bruto, estado transitório do board/PR, conjecturas ou narrativa do chat; use `[REDACTED]` e mantenha GitHub/host/repo atuais como autoridade.

---

## REGRA 5 — EDIT (atualizar informação existente)

Quando algo mudar que afeta memória já salva:
1. Identifique seção específica e arquivo alvo.
2. Atualize apenas o necessário.
3. Atualize a projeção derivada bounded somente se o caminho explícito de publicação canônica suportar essa atualização; caso contrário, preserve os derivados e registre a lacuna.

Exemplos de quando editar:
- Bug foi resolvido → atualiza status para [RESOLVIDO] em `bugs.md`
- Arquitetura mudou → atualiza seção em `architecture.md`
- Decisão foi revertida → atualiza em `decisions.md`
- Setup mudou (novo script, nova dep) → atualiza `setup.md`

---

## REGRA 6 — DELETE (remover informação obsoleta)

Quando memória não é mais relevante:
1. Determine a seção/exemplar correto para remoção.
2. Remova apenas o trecho relevante.
3. Atualize projeções derivadas somente se a remoção fizer parte de uma publicação canônica explícita e suportada; caso contrário, preserve-as e registre a lacuna.

---

## REGRA 7 — REGENERAÇÃO DO `_summary.md`

Atualize `_summary.md` e índices somente quando a memória canônica tiver sido publicada por um caminho explícito suportado, e apenas com contexto bounded. Se a projeção estiver inconsistente, o runtime pode reconstruí-la em memória; não faça uma reescrita autônoma do resumo nem reconstrua HTML/JSON a partir de uma projeção.

- NÃO re-injete na sessão atual — a sessão já tem contexto da conversa
- A próxima sessão usará a projeção publicada, quando houver

---

## REGRA 8 — BUSCA E SUPERFÍCIES DE RECUPERAÇÃO

Use superfícies de memória explícitas e pontuais:

- `memory_recall` (ID exato): `pm:p:` para projeto ou `pm:c:` para chunk; lê o Markdown canônico e retorna estado/evidência.
- `memory_search` (filtros bounded): `text`, `tag`, `tags`, `category`, `status`, `confidence`, `limit`; retorna metadados/snippets, não navegação de transcript nem corpos completos.
- `/memory:status` e `/memory:view [visible|full]` para estado e contexto atual.
- `/om:status` e `/om:view [visible|full]` como aliases de compatibilidade.
- `/memory:propose`, `/memory:accept`, `/memory:migrate`, `/memory:backfill`, `/memory:retry` na superfície atualmente verificada retornam `unavailable`; não presumem publicação, migração, backfill ou provider.

Não use uma chamada textual bare de `recall` nem assuma função sem ID. Para arquitetura, valide `architecture.json` (IDs/evidence/path) e as evidências reais antes de decisão material; `architecture.html` é somente view derivada. Em legado flat, preserve o marcador de compatibilidade e não trate o resumo como chunks canônicos.

No codebase, use `scout` para lacunas reais. Quando achado relevante, aplique SAVE/EDIT no caminho canônico apenas se existir o caminho explícito suportado.

Use busca antes de decisão arquitetural, debugging complexo ou pedido de memória específica.


---

## REGRA 9 — CHECKLIST OBRIGATÓRIO (antes de enviar resposta)

Execute mentalmente antes de CADA resposta:
```
[ ] Eu executei alguma ação que gerou ou alterou conhecimento do projeto?
[ ] Registrei no arquivo `.md` correto e atualizei projeções (`_summary.md`/índices) somente se um caminho canônico explícito suportou a publicação bounded?
[ ] Se houve mudança arquitetural/material, validei `architecture.json` e gerei `architecture.html` antes de qualquer projeção publicada?
[ ] Preservei Flow/GitHub como autoridade e segui a regra de evidência?
[ ] Evitei scan global automático e comandos/recall sem id explícito?
[ ] Considerei delegar para builder se a operação for ampla?
```

---

## REGRA 10 — FORMATO DAS ENTRADAS

Cada entrada em um arquivo `.md` deve seguir:
```markdown
## Título Descritivo da Entrada
- **Data**: YYYY-MM-DD
- **Detalhe 1**: descrição
- **Detalhe 2**: descrição
- **Arquivos relacionados**: path/to/file1, path/to/file2
```

- `bugs.md`: use status [ATIVO] ou [RESOLVIDO]
- `decisions.md`: Decisão + Alternativas consideradas + Motivo da escolha
- `architecture.md`: inclua diagramas mermaid quando relevante
- `env.md`: secrets como [REDACTED]
