---
name: project-memory
description: "Memória persistente por projeto via arquivos markdown em .pi/memory/. Auto-scan, resumo contextual, busca e edição. Ativa automaticamente em todo projeto."
---

# Project Memory Skill

## Overview

Memória de projeto persistente usando arquivos `.md` em `{cwd}/.pi/memory/`. Sem dependências externas. Funciona offline.

## Arquivos de Memória

| Arquivo | Descrição |
|---------|-----------|
| `_summary.md` | Resumo compacto (max ~10k tokens), injetado automaticamente pela extension no início de cada sessão |
| `setup.md` | Como rodar, buildar, testar, deploy. Scripts, dependências, runtime. |
| `bugs.md` | Bugs conhecidos com status [ATIVO]/[RESOLVIDO]. Workarounds e fixes. |
| `architecture.md` | Padrão de projeto, estrutura de dirs, fluxos de dados (mermaid), endpoints. |
| `env.md` | Variáveis de ambiente obrigatórias e opcionais. Secrets como [REDACTED]. |
| `api-external.md` | APIs de terceiros, rate limits, quirks. |
| `decisions.md` | Decisões técnicas. Decisão + alternativas + motivo. |

## Operações

### SAVE — Adicionar nova informação

1. Determine qual arquivo `.md` é o correto
2. Use `read` para ler o arquivo atual
3. Use `edit` para ADICIONAR a nova seção no final do arquivo
4. Formato: `## Título da Entrada` + bullets com detalhes + data
5. **REGENERE `_summary.md`** (veja Regeneração)

### EDIT — Atualizar informação existente

1. Use `read` para ler o arquivo atual
2. Use `edit` para ATUALIZAR a seção específica
3. **REGENERE `_summary.md`** (veja Regeneração)

### DELETE — Remover informação obsoleta

1. Use `read` para ler o arquivo atual
2. Use `edit` para REMOVER a seção obsoleta
3. **REGENERE `_summary.md`** (veja Regeneração)

## Scan Inicial

Se `.pi/memory/` não existe:

1. Crie o diretório: `mkdir -p .pi/memory/`
2. Copie os templates como base: `cp ~/.pi/agent/skills/project-memory/templates/*.md .pi/memory/`
3. **Use o Agent scout** com prompt PROFUNDO (ver system.md Regra 2) — mande ele vasculhar:
   - Todos os configs (package.json, tsconfig, docker, make, env)
   - Estrutura completa de dirs (3+ níveis)
   - TODOS os endpoints/APIs internas
   - Fluxos de dados críticos
   - Variáveis de ambiente (obrigatórias e opcionais)
   - APIs externas consumidas
   - TODO/FIXME/HACK nos comentários
   - Decisões técnicas visíveis
   - Frameworks, libs, versões, padrões
4. Com o resultado do scout, use `write` para popular cada arquivo `.md`
5. Gere o `_summary.md` sintetizando todos os campos (max ~10k tokens)
6. Mostre ao usuário o resumo do scan realizado

## Busca

**Na memória (.md):**
- `grep -n "termo" .pi/memory/*.md` para buscar em todos os arquivos
- `read` para ler arquivo específico

**No codebase (busca profunda):**
- Use o Agent scout para explorar o código quando precisar de detalhes que a memória não cobre
- Se a busca revelar info relevante, SAVE na memória

## Quando Salvar Automaticamente

- Bug fix concluído → `bugs.md`
- Nova feature que altera arquitetura → `architecture.md`
- Mudança em scripts/config → `setup.md`
- Decisão técnica tomada → `decisions.md`
- Descoberta de quirk de API → `api-external.md`
- Mudança em variáveis de ambiente → `env.md`

## Quando NÃO Salvar

- Q&A simples
- Leitura sem achados
- Correção de typos (apenas se afectar significado)

## Regeneração do `_summary.md`

Após QUALQUER operação de SAVE, EDIT ou DELETE:

1. Use `read` para ler TODOS os arquivos `.md` em `.pi/memory/` (exceto `_summary.md`)
2. Sintetize um NOVO resumo unificado (max ~10k tokens, seja denso com bullets)
3. Use `write` para sobrescrever `.pi/memory/_summary.md` com o novo resumo

## Tools Utilizadas

- `read` — ler arquivos `.md` existentes
- `write` — criar/sobrescrever arquivos `.md`
- `edit` — adicionar, atualizar ou remover seções em `.md`
- `bash` — `grep`, `mkdir`, `cp`, `find` para operações de filesystem
- `Agent scout` — mapear codebase durante scan inicial e buscas profundas (modelo barato MiniMax M2.7)
