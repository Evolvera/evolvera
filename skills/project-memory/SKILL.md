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
3. Leia configs do projeto:
   - `package.json` (ou `pyproject.toml`, `Cargo.toml`, `go.mod`)
   - `README.md`
   - `tsconfig.json` ou equivalente
   - `.env.example` se existir
   - `Makefile`, `docker-compose.yml` se existirem
   - Estrutura de diretórios: `find . -maxdepth 2 -type f | head -50`
4. Use `write` para popular cada arquivo `.md` com as descobertas
5. Gere o `_summary.md` sintetizando todos os campos (max ~10k tokens)
6. Mostre ao usuário o resumo do scan realizado

## Busca

- `grep -n "termo" .pi/memory/*.md` para buscar em todos os arquivos
- `read` para ler arquivo específico

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
