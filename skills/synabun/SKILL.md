---
name: synabun
description: Regras de uso do SynaBun (memória vetorial persistente via MCP) no PI
---

# SynaBun - Memória Persistente

Tu tens acesso ao SynaBun, um sistema de memória vetorial persistente para assistentes de IA, via MCP.

## Nomes das Ferramentas no PI

Com o pi-mcp-adapter, as ferramentas são prefixadas:

| Ferramenta MCP | Nome no PI |
|----------------|-----------|
| `remember` | `mcp_SynaBun_remember` |
| `recall` | `mcp_SynaBun_recall` |
| `forget` | `mcp_SynaBun_forget` |
| `restore` | `mcp_SynaBun_restore` |
| `reflect` | `mcp_SynaBun_reflect` |
| `memories` | `mcp_SynaBun_memories` |
| `sync` | `mcp_SynaBun_sync` |
| `category_create` | `mcp_SynaBun_category_create` |
| `category_update` | `mcp_SynaBun_category_update` |
| `category_delete` | `mcp_SynaBun_category_delete` |
| `category_list` | `mcp_SynaBun_category_list` |

**IMPORTANTE:** Só chame ferramentas pelos nomes EXATOS da lista acima. Nunca invente ou adivinhe nomes de ferramentas.

## Coexistência com Outras Ferramentas

No teu PI tens também o servidor MCP `memory` (server-memory oficial). **SynaBun é o dono de TODAS as operações de memória.**

| Operação | Ferramenta a usar |
|----------|-------------------|
| Guardar informação | `mcp_SynaBun_remember` |
| Buscar contexto passado | `mcp_SynaBun_recall` |
| Atualizar memórias | `mcp_SynaBun_reflect` |
| Deletar/restaurar | `mcp_SynaBun_forget` / `mcp_SynaBun_restore` |
| Listar memórias | `mcp_SynaBun_memories` |
| Detectar desatualizadas | `mcp_SynaBun_sync` |
| Categorias | `mcp_SynaBun_category_*` |

O servidor `memory` oficial do MCP deve ser usado **apenas** se o SynaBun não estiver disponível. Se notares o AI a recorrer ao `memory` para operações de memória, lembra-o de usar o SynaBun.

## Auto-Recall (lembrar automaticamente)

- **Início de sessão:** chama `mcp_SynaBun_recall` com o contexto do projeto atual
- **Tópico mencionado:** `mcp_SynaBun_recall` o que sabes
- **Antes de decisões:** `mcp_SynaBun_recall` decisões passadas
- **Debugging:** `mcp_SynaBun_recall` bugs similares

## Auto-Remember (OBRIGATÓRIO)

Após QUALQUER tarefa (bug fix, feature, refatoração, mudança de config, investigação, decisão de arquitetura), DEVES usar `mcp_SynaBun_remember` ANTES de responder.

**Passos:**
1. `mcp_SynaBun_remember` — o quê + por quê + como, categoria apropriada, projeto, related_files, importância (5=rotina, 6-7=significativo, 8+=crítico), e 3-5 tags

**NÃO é acionado por:** Q&A simples, leituras de arquivo sem achados, typos triviais.

**Importância:** 1-2=trivial, 3-4=baixa, 5=normal, 6-7=significativo, 8-9=crítico, 10=fundacional. Usuário diz "lembra disso" → 8+. Decisões de arquitetura → 8+. Quirks de API → 6+.

## Ordem de Resposta (IMPORTANTE)

Ao terminar uma tarefa, estruture a resposta assim:
1. Chame `mcp_SynaBun_remember` (e outras ferramentas de memória) **PRIMEIRO**
2. Escreva teu resumo final **POR ÚLTIMO**

Resultados de ferramentas aparecem acima do texto numa única resposta, então o resumo naturalmente fica no final onde o usuário vê. Isso evita que chamadas de memória enterrem tua mensagem final.

**Nunca** escreva teu resumo primeiro e depois chame ferramentas de memória.

## Seleção de Categoria

1. Existe filho existente → use-o
2. Pai encaixa mas não tem filho → `mcp_SynaBun_category_create` filho → use-o
3. Nada encaixa → `mcp_SynaBun_category_create` pai + filho → use-o

Nunca armazene diretamente em categorias pai.

## Quirks das Ferramentas

- `mcp_SynaBun_remember` retorna o UUID completo e aceita tags + importância diretamente.
- `mcp_SynaBun_reflect` requer UUID COMPLETO — use o retornado por `remember`, ou `mcp_SynaBun_recall` para encontrar memórias existentes.
- Chamadas MCP sequenciais apenas — nunca em paralelo.
- `mcp_SynaBun_remember` aceita `related_files` com caminhos de arquivos relacionados (será usado pelo `mcp_SynaBun_sync`).
