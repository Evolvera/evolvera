=== PROJECT-MEMORY PROTOCOL ===

## LOCALIZAÇÃO
Toda memória de projeto fica em: {cwd}/.pi/memory/
Arquivos: _summary.md, setup.md, bugs.md, architecture.md, env.md, api-external.md, decisions.md

## REGRA 1 — INÍCIO DE SESSÃO (AUTOMÁTICO VIA EXTENSION)
A extension project-memory.ts injeta o conteúdo de .pi/memory/_summary.md automaticamente no system prompt via hook before_agent_start.
Se o conteúdo injetado disser que NÃO existe memória → execute o SCAN INICIAL (Regra 2) IMEDIATAMENTE antes de responder qualquer coisa.

## REGRA 2 — SCAN INICIAL
Se .pi/memory/ não existe no projeto atual:
1. Crie o diretório: use `bash` com `mkdir -p .pi/memory/`
2. Copie os templates como base: use `bash` com `cp ~/.pi/agent/skills/project-memory/templates/*.md .pi/memory/`
3. **Use o Agent scout** para um scan PROFUNDO e COMPLETO do projeto. O scout é barato (MiniMax M2.7), então mande ele vasculhar TUDO. Use EXATAMENTE este prompt:

```
FAÇA UM SCAN PROFUNDO E COMPLETO DESTE PROJETO. Não pare na superfície — vasculhe tudo.

## Missão 1: SETUP & INFRA
- Leia package.json (ou pyproject.toml, Cargo.toml, go.mod, etc.) — scripts, deps, devDeps, engines
- Leia README.md inteiro
- Procure Makefile, docker-compose.yml, Dockerfile, .env.example, tsconfig.json, vite.config, webpack.config, etc.
- Liste TODOS os comandos disponíveis (npm scripts, make targets, etc.)
- Runtime e versões obrigatórias

## Missão 2: ARCHITECTURE
- Mapeie estrutura de diretórios COMPLETA (pelo menos 3 níveis)
- Identifique o padrão arquitetural (MVC, hexagonal, Clean Arch, modular, etc.)
- Para cada diretório principal, diga o que contém e a responsabilidade
- Identifique TODOS os endpoints/APIs internas (rotas, controllers, handlers)
- Mapeie fluxos de dados críticos (entrada → processamento → saída)
- Identifique models/schemas/entities principais
- Procure por diagramas mermaid ou documentação de arquitetura existente
- Middleware, interceptors, guards, pipes, etc.

## Missão 3: ENV & CONFIG
- Liste TODAS as variáveis de ambiente encontradas (procure em .env.example, .env.local, config files, código que usa process.env)
- Identifique quais são obrigatórias vs opcionais
- Secrets como [REDACTED]

## Missão 4: APIs EXTERNAS
- Procure por chamadas HTTP (axios, fetch, got, http client, SDKs)
- Identifique TODAS as APIs de terceiros consumidas
- Rate limits, autenticação, quirks conhecidos

## Missão 5: BUGS & CODE SMELLS
- Procure por TODO, FIXME, HACK, XXX nos comentários
- Procure por try/catch vazios ou silenciosos
- Procure por código morto (exports não usados)
- Identifique code smells evidentes

## Missão 6: DECISÕES TÉCNICAS
- Identifique frameworks/libs escolhidos e versões
- Procure por comentários que expliquem decisões (WHY, NOTE, REASON)
- Identifique padrões de código (linting, formatting, commit hooks)
- Tests: framework, onde ficam, cobertura visível

RETORNE TUDO de forma estruturada, separado por seção. Quanto mais detalhe, melhor.
```

4. Com o resultado do scout, use `write` para popular cada arquivo .md em .pi/memory/ com TODA a info coletada
5. Gere o `_summary.md` sintetizando todos os campos (max ~10k tokens)
6. Mostre ao usuário o resumo do scan realizado

## REGRA 3 — SAVE (adicionar nova informação)
Quando descobrir algo novo durante o trabalho:
1. Determine qual arquivo .md é o correto
2. Use a tool `read` para ler o arquivo atual
3. Use a tool `edit` para ADICIONAR a nova seção no final do arquivo
4. Formato: `## Título da Entrada` + bullets com detalhes + data
5. REGENERE _summary.md (veja Regra 6)

Quando salvar automaticamente:
- Bug fix concluído → bugs.md
- Nova feature que altera arquitetura → architecture.md
- Mudança em scripts/config → setup.md
- Decisão técnica tomada → decisions.md
- Descoberta de quirk de API → api-external.md
- Mudança em variáveis de ambiente → env.md

## REGRA 4 — EDIT (atualizar informação existente)
Quando algo mudar que afeta memória já salva:
1. Use `read` para ler o arquivo .md relevante
2. Use `edit` para ATUALIZAR a seção específica
3. Exemplos de quando editar:
   - Bug foi resolvido → atualiza status para [RESOLVIDO] em bugs.md
   - Arquitetura mudou → atualiza seção em architecture.md
   - Decisão foi revertida → atualiza em decisions.md
   - Setup mudou (novo script, nova dep) → atualiza setup.md
4. REGENERE _summary.md (veja Regra 6)

## REGRA 5 — DELETE (remover informação obsoleta)
Quando memória não é mais relevante:
1. Use `read` para ler o arquivo .md relevante
2. Use `edit` para REMOVER a seção obsoleta
3. REGENERE _summary.md (veja Regra 6)

## REGRA 6 — REGENERAÇÃO DO _summary.md (OBRIGATÓRIO)
Após QUALQUER operação de SAVE (Regra 3), EDIT (Regra 4) ou DELETE (Regra 5):
1. Use `read` para ler TODOS os arquivos .md em .pi/memory/ (exceto _summary.md)
2. Sintetize um NOVO resumo unificado (max ~10k tokens, seja denso com bullets)
3. Use `write` para sobrescrever .pi/memory/_summary.md com o novo resumo
4. NÃO re-injete na sessão atual — a sessão já tem contexto da conversa
5. A próxima sessão que abrir vai pegar o resumo atualizado automaticamente

## REGRA 7 — BUSCA NA MEMÓRIA
Durante a sessão, quando precisar de detalhes que não estão no resumo:

**Busca rápida** (na memória .md):
1. Use `bash` com `grep -n "termo" .pi/memory/*.md` para buscar em todos os arquivos
2. Ou use `read` para ler um arquivo .md específico inteiro

**Busca profunda** (no codebase):
3. Use o Agent scout para explorar o código-fonte quando precisar de detalhes que a memória não cobre:
   ```
   Agent(subagent_type="scout", prompt="Busque no projeto: {descrição do que precisa}")
   ```
   O scout é barato (MiniMax M2.7) e retorna resultados estruturados.
4. Se a busca revelar info relevante pro projeto, SAVE na memória (Regra 3).

Use busca ANTES de decisões arquiteturais, debugging complexo, ou quando o usuário pedir "busca na memória sobre X"

## REGRA 8 — CHECKLIST OBRIGATÓRIO (antes de enviar resposta)
Execute mentalmente antes de CADA resposta:
[ ] Eu executei alguma ação que gerou ou alterou conhecimento do projeto?
[ ] Se sim, eu salvei/editei o arquivo .md correto em .pi/memory/?
[ ] Se salvei/editei/apaguei, eu regenerei _summary.md?
[ ] Se não regenerei, PARE TUDO e execute a regeneração AGORA.

## REGRA 9 — FORMATO DAS ENTRADAS
Cada entrada em um arquivo .md deve seguir:
## Título Descritivo da Entrada
- **Data**: YYYY-MM-DD
- **Detalhe 1**: descrição
- **Detalhe 2**: descrição
- **Arquivos relacionados**: path/to/file1, path/to/file2

Para bugs.md: use status [ATIVO] ou [RESOLVIDO]
Para decisions.md: Decisão + Alternativas consideradas + Motivo da escolha
Para architecture.md: inclua diagramas mermaid quando relevante
Para env.md: secrets como [REDACTED]
