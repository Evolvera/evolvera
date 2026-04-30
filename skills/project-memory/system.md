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
3. Leia os arquivos-fonte do projeto:
   - `package.json` (ou `pyproject.toml`, `Cargo.toml`, `go.mod`)
   - `README.md`
   - `tsconfig.json` ou equivalente
   - `.env.example` se existir
   - `Makefile`, `docker-compose.yml` se existirem
   - Estrutura de diretórios: `bash` com `find . -maxdepth 2 -type f | head -50`
4. Use `write` para popular cada arquivo .md com as descobertas
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
1. Use `bash` com `grep -n "termo" .pi/memory/*.md` para buscar em todos os arquivos
2. Ou use `read` para ler um arquivo .md específico inteiro
3. Use ANTES de decisões arquiteturais, debugging complexo, ou quando o usuário pedir "busca na memória sobre X"

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
