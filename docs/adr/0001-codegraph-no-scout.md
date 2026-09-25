# ADR 0001 — Codegraph opcional para o scout

- **Status:** Aceita
- **Data:** 2026-09-25

## Contexto

O scout precisa responder perguntas estruturais de forma econômica sem trocar
suas consultas textuais por uma ferramenta que não responde a toda classe de
pergunta. Um benchmark isolado comparou codegraph e graphify em uma cópia
descartável do repositório.

## Evidências do benchmark

| Medida | Codegraph | Observação |
|---|---:|---|
| Índice | 242 arquivos JS/TS/YAML; 9.947 nós | Markdown não é indexado |
| Construção | 21 s; 31 MB | Índice local em `.codegraph/` |
| Atualização | `sync` de 1 arquivo em ~1 s | Incremental no caso medido |
| Chamadores de símbolo conhecido | 0,3–0,8 KB | `callers`/`node`, correto; grep + leitura ~10 KB |
| Busca por literal | Não responde | Rotas como `"ui-response"` e caminhos como `"settings.json"` exigem grep |
| `explore` | 16–22 KB por chamada | Alto custo; fora da configuração permitida |
| Servidor MCP 1.2.0 | Só `codegraph_explore` por padrão | `CODEGRAPH_MCP_TOOLS` habilita as demais ferramentas |
| Graphify | build code-only: 39 s; `update`: 70 s | Atualização não incremental; busca em linguagem natural errou Q2/Q3 |

O índice não é criado pelo servidor: sem inicialização prévia, ele responde
“not initialized”. O projeto controla exclusões por `codegraph.json` e o
próprio `.codegraph/` se auto-ignora no Git. Instalações existentes não recebem
a configuração atualizada automaticamente.

## Decisão

Registrar `codegraph` como servidor MCP lazy, habilitando somente `callers`,
`callees`, `node`, `impact` e `search`. O scout pode usá-lo para perguntas
estruturais quando há símbolo conhecido e índice presente. Literais, rotas,
configuração e Markdown continuam com grep e leitura. O resultado do grafo é
pista: confirmar o trecho antes de citar `arquivo:linha`. O agente não executa
`init`, `index` ou `sync`, não instala o binário e não cria `.codegraph/`.

Limite descoberto na avaliação (QA de 2026-09-25): o codegraph 1.2.0 anuncia
só `search`, `node` e `explore` em projetos com menos de 500 arquivos
indexados, qualquer que seja a lista configurada (`lib/dist/mcp/tools.js`,
`TINY_REPO_FILE_THRESHOLD`). Com `explore` fora, sobram `node` e `search` em
repositórios pequenos como este (243 arquivos). Isso basta: a saída de `node`
já inclui a trilha "Called by"/"Calls". `callers`, `callees` e `impact`
ficam na lista para projetos maiores.

## Alternativas rejeitadas

- **Graphify sem LLM:** build mais demorado, `update` de 70 s não incremental e
  busca em linguagem natural incorreta nas questões Q2 e Q3 do benchmark.
- **`explore` como padrão:** custo de 16–22 KB por chamada, contra consultas
  focadas muito menores para símbolos conhecidos.
- **`init` automático pelo agente:** criaria arquivos e índice no projeto sem
  decisão do usuário; além disso, a ferramenta não indexa Markdown nem atende
  consultas por literais.

## Consequências e riscos

- Quem instalar o binário e inicializar o índice pode obter consultas de
  chamadores e fluxo mais econômicas; sem eles, o scout segue com grep.
- Instalações existentes precisam mesclar a configuração manualmente e
  reconectar o servidor ou reiniciar o PI.
- Exclusões são responsabilidade do projeto. Há ruído potencial de
  `.pi/recovery` até a #13 resolver essa exclusão; o exemplo de configuração
  usa `{"exclude": [".pi/recovery/**"]}`.
- O índice pode estar desatualizado e não cobre Markdown ou literais; por isso,
  confirmação por leitura e fallback textual são necessários.
