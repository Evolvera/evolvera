---
name: project-memory
description: Gerencia memória persistente e organizada por projeto usando SynaBun. Inclui scan inicial, campos estruturados (setup, bugs, architecture) e recuperação automática de contexto entre sessões.
---

# Project Memory Skill

## Overview

Esta skill gerencia memória persistente e organizada por projeto usando o SynaBun MCP. Cada projeto recebe um namespace isolado (`project-memory/{project_name}`) com subcategorias estruturadas. O resumo (`_summary`) é carregado automaticamente no início de cada sessão, garantindo contexto contínuo.

## Fluxo Completo

1. **Início de Sessão**: Carrega `_summary` do projeto via recall
2. **Se não existe**: Executa Scan Inicial (cria categorias + estrutura)
3. **Durante a sessão**: Salva descobertas, bugs, decisões via `remember`
4. **Após mudanças significativas**: Regenera `_summary`
5. **Sob demanda**: Recall em categorias específicas quando necessário

## Categorias Válidas (filhos de `project-memory/{project_name}`)

| Categoria | Descrição | Importância Típica |
|-----------|-----------|-------------------|
| `_summary` | Síntese viva do projeto (~10k tokens) | 10 |
| `setup` | Como rodar, buildar, testar, deployar | 5-7 |
| `bugs` | Bugs conhecidos, workarounds, fixes | 6-8 |
| `architecture` | Estrutura, fluxos, padrões, decisões | 7-9 |
| `env` | Variáveis de ambiente, configs | 5-7 |
| `api-external` | APIs de terceiros, rate limits | 5-7 |
| `decisions` | Decisões técnicas, ADRs implícitos | 8-9 |

## Regras de Estrutura

- **NUNCA** salvar diretamente em `project-memory/{project_name}` (pai)
- **SEMPRE** usar uma subcategoria filha
- **_summary** é único e deve ser regenerado após qualquer mudança nas categorias filhas

## Scan Inicial (quando `_summary` não existe)

Quando `project-memory/{project_name}/_summary` não é encontrado:

1. Criar categorias via `mcp_SynaBun_category_create`:
   - `project-memory/{project_name}/setup`
   - `project-memory/{project_name}/bugs`
   - `project-memory/{project_name}/architecture`
   - `project-memory/{project_name}/env`
   - `project-memory/{project_name}/api-external`
   - `project-memory/{project_name}/decisions`
   - `project-memory/{project_name}/_summary`

2. Ler arquivos do projeto:
   - `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod`
   - `README.md`, `CONTRIBUTING.md`
   - `tsconfig.json` / `pyproject.toml` / `rust-toolchain.toml`
   - `.env.example` / `.env.template`
   - Estrutura de diretórios (nível 1-2)

3. Para cada achado relevante, salvar via `mcp_SynaBun_remember` na categoria apropriada com `importance` 5-7

4. Gerar `_summary` usando `templates/summary-template.md`

5. Salvar `_summary` via `mcp_SynaBun_remember` com `importance: 10`

## Regeneração do `_summary`

Após qualquer `mcp_SynaBun_remember` ou `mcp_SynaBun_reflect` que altere memórias do projeto:

1. Fazer `mcp_SynaBun_recall` com query geral em TODAS as categorias filhas (exceto `_summary`)
2. Sintetizar novo resumo unificado (máx ~10k tokens)
3. Salvar via `mcp_SynaBun_remember` em `project-memory/{project_name}/_summary`

## Recall Sob Demanda

Execute `mcp_SynaBun_recall` com query específica nas categorias relevantes quando:

- Propor mudanças arquiteturais
- Debugar bugs complexos
- Adicionar features que possam conflitar com decisões passadas
- Usuário disser "busca na memória sobre X" ou "lembra de algo sobre Y"

## Checklist de Salvar Automaticamente

Salvar via `mcp_SynaBun_remember` quando:

- [ ] Bug descoberto ou workaround implementado
- [ ] Decisão técnica tomada (framework, padrão, abordagem)
- [ ] Configuração importante encontrada/modificada
- [ ] Endpoint ou API externa integrada
- [ ] Estrutura de diretórios alterada
- [ ] Problema recorrente identificado
- [ ] Setup/build/test commands descobertos

Salvar manualmente quando:

- [ ] Usuário solicitar explicitamente
- [ ] Informação crítica sobre o projeto obtida via pesquisa
- [ ] Decisão arquitetural significativa documentada

## Formato de Memória

Cada entrada nas categorias de detalhe (exceto `_summary`):
- **Máximo**: 400 tokens
- **Campos obrigatórios**:
  - `related_files`: array de caminhos relativos
  - `tags`: 3-5 strings
  - `importance`: número 1-10
  - `content`: texto denso com bullet points
