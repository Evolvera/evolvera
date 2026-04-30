=== PROJECT-MEMORY PROTOCOL ===

## REGRA 1 — INÍCIO DE SESSÃO

SEMPRE que esta skill está ativa, ANTES de responder qualquer coisa ao usuário:

1. Identifique o `project_name` (diretório atual ou `package.json:name`)
2. Chame `mcp_SynaBun_recall` com query = nome do projeto, filtrando pela categoria `project-memory/{project_name}/_summary`
3. Se retornar memória → injete o conteúdo no contexto (máx 10k tokens)
4. Se NÃO retornar → execute o SCAN INICIAL (veja Regra 2)

## REGRA 2 — SCAN INICIAL

Se `project-memory/{project_name}/_summary` não existir:

1. Crie as categorias via `mcp_SynaBun_category_create`:
   - `project-memory/{project_name}/setup`
   - `project-memory/{project_name}/bugs`
   - `project-memory/{project_name}/architecture`
   - `project-memory/{project_name}/env`
   - `project-memory/{project_name}/api-external`
   - `project-memory/{project_name}/decisions`
   - `project-memory/{project_name}/_summary`

2. Leia: `package.json` (ou equivalente), `README.md`, `tsconfig.json`/`pyproject.toml`/`Cargo.toml`, `.env.example`, estrutura de diretórios (nível 1-2)

3. Para cada achado relevante, salve via `mcp_SynaBun_remember` na categoria correta com `importance` 5-7

4. Gere o `_summary` usando o template de `templates/summary-template.md`

5. Salve o `_summary` via `mcp_SynaBun_remember` na categoria `project-memory/{project_name}/_summary` com `importance: 10`

## REGRA 3 — REGENERAÇÃO OBRIGATÓRIA DO _SUMMARY

Após QUALQUER `mcp_SynaBun_remember` ou `mcp_SynaBun_reflect` que altere memórias do projeto (qualquer categoria filha de `project-memory/{project_name}`):

1. Faça `mcp_SynaBun_recall` com query geral do projeto em TODAS as categorias filhas (exceto `_summary`)
2. Sintetize um NOVO resumo unificado (máx ~10k tokens)
3. Salve o novo resumo em `project-memory/{project_name}/_summary` via `mcp_SynaBun_remember`
4. Se já existir memória anterior em `_summary`, use `mcp_SynaBun_reflect` para atualizar, ou `mcp_SynaBun_forget` a antiga + `remember` a nova

## REGRA 4 — CHECKLIST OBRIGATÓRIO

Antes de enviar QUALQUER resposta, execute mentalmente:

```
[ ] Eu executei alguma ação que muda o projeto (código, config, fix, decisão)?
[ ] Se sim, eu chamei mcp_SynaBun_remember para registrar?
[ ] Se chamei remember/reflect em qualquer categoria de project-memory/{nome}, eu regenerei _summary?
[ ] Se não regenerei, PARE TUDO e execute a regeneração AGORA.
```

## REGRA 5 — RECALL SOB DEMANDA

ANTES de:
- Propor mudanças arquiteturais
- Debugar bugs complexos
- Adicionar novas features que possam conflitar com decisões passadas

Execute `mcp_SynaBun_recall` com query específica nas categorias relevantes (não apenas no `_summary`).

Se o usuário disser "busca na memória sobre X" ou "lembra de algo sobre Y", faça `recall` com a query.

## REGRA 6 — CATEGORIAS E NAMESPACE

Campos válidos (filhos de `project-memory/{project_name}`):
- `_summary` — SÍNTESE VIVA do projeto (carregada no início de cada sessão)
- `setup` — como rodar, buildar, testar, deployar
- `bugs` — bugs conhecidos, workarounds, fixes anteriores
- `architecture` — file structure, fluxos de dados (mermaid), endpoints, decisões técnicas, padrões
- `env` — variáveis de ambiente necessárias, secrets (mascare como [REDACTED]), configs por ambiente
- `api-external` — APIs de terceiros, rate limits, quirks, documentação relevante
- `decisions` — decisões técnicas importantes, ADRs implícitos, porquês

NUNCA armazene diretamente em `project-memory/{project_name}` (pai). SEMPRE use um campo filho.

## REGRA 7 — IMPORTÂNCIA

- 5 = rotina (update menor de setup)
- 6-7 = significativo (bug com workaround, novo endpoint)
- 8-9 = crítico (decisão arquitetural, bug grave evitado)
- 10 = fundacional (escolha de framework, estrutura de pastas, ou o _summary)

## REGRA 8 — FORMATO DE MEMÓRIA

Máximo 400 tokens por entrada nas categorias de detalhe. Seja denso. Use bullet points.
Inclua sempre:
- `related_files`: array de caminhos relativos
- `tags`: 3-5 strings
- `importance`: número 1-10

O `_summary` pode ter até ~10k tokens e deve ser estruturado conforme o template em `templates/summary-template.md`.
