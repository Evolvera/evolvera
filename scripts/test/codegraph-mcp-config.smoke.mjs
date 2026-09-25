import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Normaliza BOM e quebras Windows para que a validação aceite arquivos válidos
// independentemente da plataforma que os gravou.
function normalizeText(text) {
  return text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
}

function readText(relativePath) {
  return normalizeText(readFileSync(path.join(root, relativePath), "utf8"));
}

function verificar(descricao, callback) {
  try {
    return callback();
  } catch (error) {
    throw new Error(`Falha na verificação: ${descricao}: ${error.message}`, { cause: error });
  }
}

// Confere a normalização em memória para cobrir arquivos BOM/CRLF sem escrita.
verificar("a leitura deve tolerar BOM e CRLF", () => {
  assert.equal(normalizeText("\uFEFFlinha 1\r\nlinha 2"), "linha 1\nlinha 2");
});

const config = verificar("config/mcp.json deve ser JSON válido", () => JSON.parse(readText("config/mcp.json")));
verificar("mcpServers deve continuar sendo um objeto", () => {
  assert.ok(config.mcpServers && typeof config.mcpServers === "object" && !Array.isArray(config.mcpServers));
});
verificar("a entrada codegraph deve usar stdio lazy e o comando acordado", () => {
  assert.deepEqual({
    ...config.mcpServers.codegraph,
    env: undefined,
  }, {
    command: "codegraph",
    args: ["serve", "--mcp"],
    lifecycle: "lazy",
    env: undefined,
  });
  assert.equal(typeof config.mcpServers.codegraph.env.CODEGRAPH_MCP_TOOLS, "string");
});
verificar("a lista de ferramentas deve permitir apenas consultas estruturais previstas", () => {
  const tools = config.mcpServers.codegraph.env.CODEGRAPH_MCP_TOOLS
    .split(",")
    .map((tool) => tool.trim())
    .filter(Boolean);
  assert.deepEqual(tools, ["callers", "callees", "node", "impact", "search"]);
  assert.equal(tools.includes("explore"), false, "explore é excluída pelo custo observado");
});
verificar("somente o servidor codegraph deve ser registrado nesta configuração", () => {
  assert.deepEqual(Object.keys(config.mcpServers), ["codegraph"]);
});

const scout = readText("agents/scout.md").split(/^---\s*$/m).slice(2).join("---");
for (const [descricao, ancora] of [
  ["a seção opcional do grafo", /Grafo de código \(opcional\)/i],
  // Cada âncora usa [^\n]* (e não [\s\S]*): a regra inteira precisa estar
  // numa mesma linha, para que uma palavra solta em outro trecho do prompt
  // não baste para o teste passar.
  ["as ferramentas estruturais", /mcp__codegraph[^\n]*codegraph_callers[^\n]*codegraph_callees[^\n]*codegraph_node[^\n]*codegraph_impact[^\n]*codegraph_search/],
  ["a preferência por grep para literais, rotas, configuração e Markdown", /literais[^\n]*rotas[^\n]*configuração[^\n]*Markdown[^\n]*grep/i],
  ["fallback sem corrigir servidor ou índice ausentes", /servidor[^\n]*não existir[^\n]*índice[^\n]*ausente[^\n]*grep[^\n]*não tente corrigir/i],
  ["a proibição de inicializar ou indexar", /nunca[^\n]*init[^\n]*index[^\n]*sync[^\n]*\.codegraph\//i],
  ["a confirmação do trecho antes de citar linha", /confirme o trecho por leitura antes de citar arquivo:linha/i],
]) {
  verificar(`agents/scout.md deve conter ${descricao}`, () => assert.match(scout, ancora));
}

console.log("codegraph-mcp-config smoke: PASS");
