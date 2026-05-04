# LightRAG Framework - Deep Research Report
## Knowledge Graph Extraction from Novels for NovelForge

**Data da Pesquisa:** 2026-05-03
**Projeto:** NovelForge Pipeline
**Framework:** LightRAG (HKUDS, 2024)
**Repositório:** https://github.com/HKUDS/LightRAG
**Paper:** arXiv:2410.05779

---

## Sumário Executivo

| Aspecto | Status | Observação |
|----------|--------|------------|
| Versão Estável | ✅ v2.x | Última release: 2026.03 |
| Tipos de Entidade Customizáveis | ✅ Sim | Via `addon_params.entity_types` |
| Tipos de Relação Customizáveis | ⚠️ Parcial | Keywords livres, mas tipos fixos |
| Neo4j Integration | ✅ Sim | Nativo via `Neo4JStorage` |
| Export Graph Completo | ✅ Sim | Via `export_data()` |
| Large Documents (>500KB) | ✅ Suportado | Chunking configurável |
| Multi-LLM Backend | ✅ Sim | OpenAI, Claude, Ollama, Gemini, etc. |
| Portuguese/Multilingual | ✅ Sim | Via `addon_params.language` |
| Custom Prompts | ✅ Sim | Via `prompt.py` customization |
| Incremental Refinement | ✅ Sim | `ainsert()` append-only |

---

## 1. Arquitetura Geral

### 1.1 Indexing Pipeline (Extração de KG)

```
DocumentoTexto
    │
    ▼
[Chunking por Tokens] ──►  chunk_token_size=1200 (default)
    │                         chunk_overlap_token_size=100
    ▼
[Embedding dos Chunks] ──►  Vetoriza chunks
    │
    ▼
[Entity Extraction] ──────►  LLM extrai entidades e relações
    │                         do texto + histórico (gleaning)
    ▼
[KG Storage] ─────────────►  GraphDB (NetworkX/Neo4j/Postgres)
    │
    ▼
[Vector Storage] ─────────►  Embeddings (Entity/Relation/Chunks)
    │
    ▼
[KV Storage] ─────────────►  Cache LLM, Text Chunks, Docs
```

### 1.2 Query Pipeline

```
Query
    │
    ▼
[Keyword Extraction] ────►  high_level + low_level keywords
    │
    ▼
[Mode Selection]
    │
    ├─── "local" ────────►  Entidades vizinhas ao MATCH
    ├─── "global" ───────►  Community detection + summaries
    ├─── "hybrid" ───────►  local + global
    ├─── "mix" ─────────►  KG + Vector (recomendado c/ reranker)
    └─── "naive" ───────►  Só vector search
    │
    ▼
[Rerank] (opcional)
    │
    ▼
[LLM Synthesis] ────────►  Gera resposta contextual
```

---

## 2. API Reference Completa

### 2.1 Inicialização

```python
from lightrag import LightRAG, QueryParam
from lightrag.llm.openai import gpt_4o_mini_complete, openai_embed

rag = LightRAG(
    working_dir="./rag_storage",
    llm_model_func=gpt_4o_mini_complete,
    embedding_func=openai_embed,
    
    # Customização para NovelForge:
    chunk_token_size=800,           # Chunks menores para ficção
    chunk_overlap_token_size=150,
    addon_params={
        "language": "Portuguese",
        "entity_types": [
            "Person", "Creature", "Organization", "Location",
            "Event", "Concept", "Method", "Content", "Data",
            "Artifact", "NaturalObject", "Rule", "Spell", "Faction"
        ]
    }
)

await rag.initialize_storages()
```

### 2.2 Parâmetros de Inicialização (Init Parameters)

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|--------|-----------|
| `working_dir` | str | `./rag_cache` | Diretório de cache |
| `workspace` | str | - | Isolamento de workspaces |
| `kv_storage` | str | `JsonKVStorage` | Backend KV |
| `vector_storage` | str | `NanoVectorDBStorage` | Backend vetorial |
| `graph_storage` | str | `NetworkXStorage` | Backend grafo |
| `doc_status_storage` | str | `JsonDocStatusStorage` | Status docs |
| `chunk_token_size` | int | `1200` | Max tokens por chunk |
| `chunk_overlap_token_size` | int | `100` | Overlap entre chunks |
| `entity_extract_max_gleaning` | int | `1` | Tentativas de re-extrração |
| `llm_model_func` | callable | `gpt_4o_mini_complete` | Função LLM |
| `embedding_func` | EmbeddingFunc | `openai_embed` | Função embedding |
| `addon_params` | dict | `{language: "English", entity_types: [...]}` | Params extras |

### 2.3 QueryParam

```python
class QueryParam:
    mode: Literal["local", "global", "hybrid", "naive", "mix", "bypass"] = "global"
    only_need_context: bool = False      # Só retorna contexto, sem resposta
    only_need_prompt: bool = False      # Só retorna prompt
    response_type: str = "Multiple Paragraphs"  # Formato da resposta
    stream: bool = False                 # Streaming output
    top_k: int = 60                     # Entidades/relações KG
    chunk_top_k: int = 20               # Chunks vetoriais
    max_entity_tokens: int = 6000      # Budget tokens entidades
    max_relation_tokens: int = 8000     # Budget tokens relações
    max_total_tokens: int = 30000       # Budget total
    conversation_history: list[dict] = []  # Histórico para contexto
    enable_rerank: bool = True         # Reranking habilitado
    user_prompt: str = None            # Instruções adicionais
```

### 2.4 Operações Principais

```python
# Insert
await rag.ainsert("Texto do capítulo...")
await rag.ainsert(["Cap1...", "Cap2...", "Cap3..."])  # Batch
await rag.ainsert("Texto", ids=["doc-id"])  # Com ID custom

# Query
result = await rag.aquery(
    "Quem são os personagens principais?",
    param=QueryParam(mode="hybrid")
)

# Export (Graph Completo!)
await rag.aexport_data("kg_export.csv", file_format="csv")
await rag.aexport_data("kg_export.xlsx", file_format="excel")
await rag.aexport_data("kg_export.md", file_format="md")

# Insert Custom KG (para migração)
custom_kg = {
    "chunks": [{"content": "...", "source_id": "src1"}],
    "entities": [{"entity_name": "...", "entity_type": "...", "description": "..."}],
    "relationships": [{"src_id": "...", "tgt_id": "...", "description": "..."}]
}
rag.insert_custom_kg(custom_kg)

# Entity Management
rag.merge_entities(
    source_entities=["The Wizard", "The Sorcerer"],
    target_entity="Gandalf"
)
```

---

## 3. Customização de Entity Types

### 3.1 Definição de Tipos Customizados

```python
# Tipos Padrão
DEFAULT_ENTITY_TYPES = [
    "Person", "Creature", "Organization", "Location",
    "Event", "Concept", "Method", "Content", "Data",
    "Artifact", "NaturalObject"
]

# Extensão para NovelForge (Fantasy/Sci-Fi)
rag = LightRAG(
    ...
    addon_params={
        "language": "Portuguese",
        "entity_types": [
            # Padrões
            "Person", "Creature", "Organization", "Location",
            "Event", "Concept", "Method", "Content", "Data",
            "Artifact", "NaturalObject",
            # Custom NovelForge
            "Rule",       # Regras de magia/sistema
            "Spell",      # Magias e encantamentos
            "Faction",    # Facções e organizações
            "Location",    # Localizações (reino, masmorra)
            "Artifact",   # Itens mágicos
            "Creature",   # Monstros e criaturas
            "Event",      # Eventos históricos/batalhas
            "Concept"     # Conceitos (aliança, traição)
        ]
    }
)
```

### 3.2 Extracting Custom Relations

**IMPORTANTE:** LightRAG usa keywords livres para relações, não tipos fixos. Você pode definir semanticamente o que quiser:

```python
# As relações são extraídas com keywords livres
# Exemplo de output da extração:

relation{tuple_delimiter}Gandalf{tuple_delimiter}Saruman{tuple_delimiter}contradicts, opposes{tuple_delimiter}
  Gandalf e Saruman têm visões opostas sobre o uso do Anel.

relation{tuple_delimiter}Frodo{tuple_delimiter}The One Ring{tuple_delimiter}possesses, carries{tuple_delimiter}
  Frodo carrega o Um Anel.

relation{tuple_delimiter}Gandalf{tuple_delimiter}Fireball{tuple_delimiter}casts, knows{tuple_delimiter}
  Gandalf conhece a magia Fireball.
```

---

## 4. Neo4j Integration

### 4.1 Configuração

```bash
# Ambiente
export NEO4J_URI="neo4j://localhost:7687"
export NEO4J_USERNAME="neo4j"
export NEO4J_PASSWORD="password"
export NEO4J_DATABASE="novelforge"
```

### 4.2 Uso

```python
from lightrag import LightRAG

rag = LightRAG(
    working_dir="./rag_storage",
    llm_model_func=gpt_4o_mini_complete,
    embedding_func=openai_embed,
    graph_storage="Neo4JStorage"  # ← Neo4j como backend KG
)

await rag.initialize_storages()
await rag.ainsert("texto do livro...")
await rag.aexport_data("kg_export.csv")
```

### 4.3 Performance Note

> "Testing has shown that Neo4J delivers superior performance in production environments compared to PostgreSQL with AGE plugin." — Docs

---

## 5. Graph Export - Extraindo KG Completo

### 5.1 Métodos de Export

```python
# CSV (padrão)
rag.export_data("kg.csv", file_format="csv")

# Excel (múltiplas sheets)
rag.export_data("kg.xlsx", file_format="excel")

# Markdown
rag.export_data("kg.md", file_format="md")

# Texto
rag.export_data("kg.txt", file_format="txt")
```

### 5.2 Estrutura do Export

O export inclui:
- **Entities**: id, tipo, descrição, source_id
- **Relationships**: source, target, keywords, weight, description
- **Chunks**: conteúdo original

### 5.3 Custom KG Insert

Para importar KG externo:

```python
custom_kg = {
    "chunks": [
        {
            "content": "Harry Potter descobriu que era um bruxo aos 11 anos.",
            "source_id": "hp_book1",
            "file_path": "harry_potter_ch1.txt"
        }
    ],
    "entities": [
        {
            "entity_name": "Harry Potter",
            "entity_type": "Person",
            "description": "O protagonista bruxo.",
            "source_id": "hp_book1",
            "file_path": "harry_potter_ch1.txt"
        },
        {
            "entity_name": "Hogwarts",
            "entity_type": "Location",
            "description": "Escola de magia.",
            "source_id": "hp_book1"
        },
        {
            "entity_name": "Expelliarmus",
            "entity_type": "Spell",
            "description": "Feitiço de desarmamento.",
            "source_id": "hp_book1"
        }
    ],
    "relationships": [
        {
            "src_id": "Harry Potter",
            "tgt_id": "Hogwarts",
            "description": "Harry estuda em Hogwarts.",
            "keywords": "estuda, frequenta",
            "weight": 1.0,
            "source_id": "hp_book1"
        },
        {
            "src_id": "Harry Potter",
            "tgt_id": "Expelliarmus",
            "description": "Harry conhece o feitiço.",
            "keywords": "conhece, usa",
            "weight": 0.8,
            "source_id": "hp_book1"
        }
    ]
}

rag.insert_custom_kg(custom_kg)
```

---

## 6. Performance com Large Documents

### 6.1 Chunking Strategy

```python
rag = LightRAG(
    chunk_token_size=800,           # Reduzir para ficção (mais granular)
    chunk_overlap_token_size=150,   # Maior overlap para contexto
    max_parallel_insert=4,           # Parallelismo (max ~10)
    embedding_batch_num=32,         # Batch de embedding
)
```

### 6.2 Large Documents (>500KB)

**Recomendação:**
1. Chunk size menor (600-800 tokens) para ficção
2. Overlap maior (100-150 tokens)
3. Batch parallel insert (4-8)
4. Usar LLM com 32k+ context

### 6.3 LLM Requirements

> "It is recommended to use an LLM with at least 32 billion parameters. The context length should be at least 32KB, with 64KB being recommended. It is not recommended to choose reasoning models during the document indexing stage."

---

## 7. Multi-LLM Backend Support

### 7.1 Providers Suportados

| Provider | Módulo | Notas |
|----------|--------|-------|
| OpenAI | `llm.openai` | `gpt_4o_mini_complete`, etc |
| Anthropic | `llm.anthropic` | Claude support |
| Azure | `llm.azure_openai` | Enterprise |
| Gemini | `llm.gemini` | Google |
| Ollama | `llm.ollama` | Local (Llama, etc) |
| HuggingFace | `llm.hf` | Local models |
| vLLM | `llm/vllm.py` | Local inference |
| Bedrock | `llm.bedrock` | AWS |
| LlamaIndex | `llm.llama_index_impl` | Integration |

### 7.2 Exemplo Ollama (Local)

```python
from lightrag.llm.ollama import ollama_model_complete, ollama_embed

rag = LightRAG(
    working_dir="./rag_storage",
    llm_model_func=ollama_model_complete,
    llm_model_name='qwen2',
    llm_model_kwargs={"options": {"num_ctx": 32768}},  # 32k context!
    embedding_func=EmbeddingFunc(
        embedding_dim=768,
        max_token_size=8192,
        model_name="nomic-embed-text",
        func=ollama_embed
    )
)
```

---

## 8. Portuguese Language Support

### 8.1 Configuração

```python
rag = LightRAG(
    ...
    addon_params={
        "language": "Portuguese",  # ← Suporte nativo!
        "entity_types": ["Person", "Location", ...]
    }
)
```

### 8.2 Prompt de Extração (language-aware)

O LLM extrai na língua especificada:

```
// Output example (language: Portuguese):
entity{sep}Harry Potter{sep}Person{sep}Harry Potter é o protagonista bruxo.
relation{sep}Harry Potter{sep}Hogwarts{sep}frequenta, estuda{Hsep}Harry estuda em Hogwarts.
```

---

## 9. Custom Prompts para Extraction

### 9.1 Localização

Os prompts estão em `lightrag/prompt.py` (PROMPTS dict).

### 9.2 Customização do Entity Extraction Prompt

```python
# Em prompt.py, modify PROMPTS["entity_extraction_system_prompt"]
# Para adicionar tipos custom:

PROMPTS["entity_extraction_system_prompt"] = """...
Entity Types: {entity_types}
// Adicionar:
* Se for uma regra de magia/sistema: tipo "Rule"
* Se for uma magia: tipo "Spell"
* Se for uma facção: tipo "Faction"
...
"""
```

### 9.3 Approach Alternativa (Recomendada)

Ao invés de modificar prompts internamente, use **custom keywords** nas relações:

```python
# As keywords das relações são livres
relation{sep}Gandalf{sep}Saruman{sep}contradicts, opposes, hates{sep}
```

No post-processing, mapeie keywords para tipos de relação.

---

## 10. Incremental Graph Refinement

### 10.1 Adicionar Mais Texto

```python
# Append-only (não sobrescreve)
await rag.ainsert("Novo capítulo...")
await rag.ainsert("Mais um capítulo...")
```

### 10.2 Merge Entities

```python
# Merge de entidades com nomes diferentes
rag.merge_entities(
    source_entities=["The Wizard", "The Sorcerer", "Gandalf the White"],
    target_entity="Gandalf",
    merge_strategy={
        "description": "concatenate",  # Junta descrições
        "entity_type": "keep_first",
        "source_id": "join_unique"
    }
)
```

### 10.3 Delete & Rebuild

```python
# Delete por documento (rebuild automático do KG)
await rag.adelete_by_doc_id("doc-id-123")

# Delete entidade específica
await rag.adelete_by_entity("CharacterName")
```

---

## 11. Entity Ambiguity Handling

### 11.1 Gleaning (Re-extração)

```python
rag = LightRAG(
    entity_extract_max_gleaning=2  # ← Tentativas extras
)
```

O sistema faz múltiplas passagens para encontrar entidades perdidas.

### 11.2 Entity Merging

```python
# Manual merge após extração
rag.merge_entities(
    source_entities=["The Wizard", "Gandalf the Grey", "Mithrandir"],
    target_entity="Gandalf"
)
```

### 11.3 Limitações

> LightRAG não resolve ambiguidade automaticamente. Para ficção com personagens que mudam de nome/título, é necessário:
> 1. Post-processing manual/rule-based
> 2. Merge entities após extração
> 3. Nomes consistentes no input (ideal)

---

## 12. Graph Format & Storage

### 12.1 Storage Backends

| Tipo | Implementações |
|------|----------------|
| Graph | NetworkX (default), **Neo4j**, PostgreSQL/AGE, Memgraph, OpenSearch |
| Vector | Nano (default), PostgreSQL, Milvus, Qdrant, Faiss, MongoDB, OpenSearch |
| KV | JSON (default), PostgreSQL, Redis, MongoDB, OpenSearch |
| DocStatus | JSON (default), PostgreSQL, MongoDB, OpenSearch |

### 12.2 Graph Format

**NetworkX:** GraphML (XML)
**Neo4j:** Cypher/Native Graph
**Export:** CSV, Excel, Markdown, TXT

### 12.3 Data Model

```python
# KnowledgeGraphNode
{
    "id": "entity_name",
    "labels": ["Person"],
    "properties": {
        "entity_type": "Person",
        "description": "...",
        "source_id": "chunk_id"
    }
}

# KnowledgeGraphEdge  
{
    "id": "src-tgt",
    "type": "DIRECTED",
    "source": "entity_a",
    "target": "entity_b",
    "properties": {
        "keywords": "knows, meets",
        "description": "...",
        "weight": 1.0
    }
}
```

---

## 13. Limitações e Workarounds

### 13.1 Limitações Conhecidas

| Limitação | Severity | Workaround |
|-----------|----------|------------|
| Relação N-ária → binary only | Medium | Decompor em relações binárias (built-in) |
| Entity ambiguity não resolvido | Medium | Post-processing + merge |
| Reasoning models não recomendados p/ indexing | Low | Usar modelo fixo (não o4o-mini) |
| Embedding model fixo por storage | Medium | Clear storage ao trocar modelo |
| Portuguese prompt quality depende do LLM | Low | Usar modelo multilíngue (ex: Claude) |

### 13.2 Known Issues (GitHub)

- Embedding function wrapping não pode ser nested
- Storage initialization `await rag.initialize_storages()` é obrigatório
- Ao trocar embedding model, limpar storage (exceto LLM cache)

---

## 14. GO/NO-GO Assessment para NovelForge

### 14.1 Critérios de Avaliação

| Critério | Score | Notas |
|----------|-------|-------|
| Custom entity types | ✅ 9/10 | Via `addon_params.entity_types` |
| Custom relation types | ⚠️ 6/10 | Keywords livres, sem tipos formais |
| Graph export completo | ✅ 9/10 | `export_data()` com CSV/Excel/MD |
| Neo4j integration | ✅ 9/10 | Native `Neo4JStorage` |
| Large documents | ✅ 8/10 | Chunking configurável |
| Multi-LLM | ✅ 10/10 | OpenAI, Claude, Ollama, Gemini, etc |
| Portuguese | ✅ 8/10 | Via `language: Portuguese` |
| Custom prompts | ✅ 7/10 | Via `prompt.py` modification |
| Incremental | ✅ 8/10 | `ainsert()` append-only |
| Fictional text quality | ⚠️ 6/10 | Genérico, não otimizado para ficção |

### 14.2 Verdict

## ✅ RECOMENDADO COM RESSALVAS

LightRAG é uma excelente escolha para NovelForge com as seguintes observações:

**Pontos Fortes:**
1. API madura e bem documentada
2. Neo4j native integration
3. Multi-backend storage flexível
4. Export completo para análise
5. Suporte multilíngue funcional

**Pontos de Atenção:**
1. **Relation types**: Não há tipos formais de relação. Use keywords como proxy (ex: `HAS_RULE`, `CAUSES`).
2. **Fictional text**: LightRAG é genérico. Para ficção, talvez precise de post-processing para kualitas.
3. **Entity disambiguation**: Requer merge manual para personagens com múltiplos nomes.

**Recomendação de Setup para NovelForge:**

```python
rag = LightRAG(
    working_dir="./novelforge_kg",
    llm_model_func=claude_complete,  # Claude para melhor ficção
    embedding_func=bge_m3_embed,     # Multilingual embedding
    chunk_token_size=600,             # Granular para ficção
    graph_storage="Neo4JStorage",     # Neo4j para KG production
    addon_params={
        "language": "Portuguese",
        "entity_types": [
            "Person", "Creature", "Organization", "Location",
            "Event", "Concept", "Artifact", "Rule", "Spell", "Faction"
        ]
    }
)
```

---

## 15. Exemplo Prático: Novel Chapter → KG

### 15.1 Input

```
Capítulo 1: O Chamado

Nas montanhas de Gondor, Gandalf o Branco caminhava pensativo. 
Ele sabia que o Um Anel havia despertado e que Sauron retornava.
"Isto é grave", pensou o mago. "Se Frodo não destruir o Anel, 
a Terra Média será consumida pelas trevas."

Frodo Bolseiro, um jovem hobbit do Condado, ainda não sabia 
que seu destino mudaria para sempre naquela noite.
```

### 15.2 Output (Extração)

```
entities:
entity{G}Gandalf{P}Person{G}Gandalf é um mago Istari que caminha pelas montanhas de Gondor.
entity{G}The One Ring{P}Artifact{G}O Um Anel é um artefato poderoso que Sauron forjou.
entity{G}Sauron{P}Person{G}Sauron é o Senhor das Trevas que retornará.
entity{G}Frodo{P}Person{G}Frodo Bolseiro é um hobbit do Condado.
entity{G}Mordor{P}Location{G}Mordor é a terra das trevas associada a Sauron.
entity{G}Middle-earth{P}Location{G}A Terra Média é o continente onde ocorre a história.

relations:
relation{G}Gandalf{G}The One Ring{G}knows, concerned{G}Gandalf sabe sobre o retorno do Anel.
relation{G}Sauron{G}The One Ring{G}possesses, forged{G}Sauron forjou o Um Anel.
relation{G}Frodo{G}The One Ring{G}destined to destroy{G}Frodo é destinado a destruir o Anel.
relation{G}Mordor{G}Sauron{G}ruled by{G}Mordor é a terra de Sauron.
relation{G}Gandalf{G}Frodo{G}seeks to protect{G}Gandalf busca proteger Frodo.
```

### 15.3 Post-Processing para NovelForge

```python
# Mapear keywords para tipos de relação
RELATION_TYPE_MAPPING = {
    "knows": "KNOWS",
    "concerned": "CONCERNED_ABOUT",
    "possesses": "HAS_POSSESSION",
    "forged": "FORGED",
    "destined to destroy": "MUST_DESTROY",
    "ruled by": "RULES",
    "seeks to protect": "PROTECTS",
    "cast": "CASTS",
    "causes": "CAUSES",
    "contradicts": "CONTRADICTS"
}
```

---

## 16. Referências

- **Paper:** Guo et al. (2024). "LightRAG: Simple and Fast Retrieval-Augmented Generation." arXiv:2410.05779
- **GitHub:** https://github.com/HKUDS/LightRAG
- **Docs:** https://github.com/HKUDS/LightRAG/tree/main/docs
- **Discord:** https://discord.gg/yF2MmDJyGJ
- **PyPI:** https://pypi.org/project/lightrag-hku/

---

## Anexo A: Environment Variables

```bash
# LLM
OPENAI_API_KEY=sk-...
AZURE_OPENAI_API_KEY=...
GEMINI_API_KEY=...

# Embedding
EMBEDDING_MODEL=text-embedding-3-large
EMBEDDING_DIM=3072

# Neo4j
NEO4J_URI=neo4j://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=password

# Storage
LIGHTRAG_KV_STORAGE=JsonKVStorage
LIGHTRAG_VECTOR_STORAGE=NanoVectorDBStorage
LIGHTRAG_GRAPH_STORAGE=Neo4JStorage

# Query
TOP_K=60
MAX_TOTAL_TOKENS=30000
```

## Anexo B: Quick Start Code

```python
import asyncio
from lightrag import LightRAG, QueryParam
from lightrag.llm.openai import gpt_4o_mini_complete, openai_embed

async def main():
    rag = LightRAG(
        working_dir="./novelforge",
        llm_model_func=gpt_4o_mini_complete,
        embedding_func=openai_embed,
        addon_params={
            "language": "Portuguese",
            "entity_types": ["Person", "Location", "Artifact", "Spell", "Faction"]
        }
    )
    
    await rag.initialize_storages()
    
    # Index novel
    with open("capitulo1.txt") as f:
        await rag.ainsert(f.read())
    
    # Query
    result = await rag.aquery(
        "Quem são os personagens e suas relações?",
        param=QueryParam(mode="hybrid")
    )
    
    # Export
    await rag.aexport_data("kg_cap1.csv")
    
    await rag.finalize_storages()

asyncio.run(main())
```

---

*Relatório gerado em: 2026-05-03*
*Fonte: Análise do código-fonte LightRAG v2.x + Documentação oficial*
