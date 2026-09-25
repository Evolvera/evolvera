import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Normaliza BOM e quebras Windows para que a validação aceite arquivos válidos
// independentemente da plataforma que os gravou.
function readText(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n");
}

function verificar(descricao, callback) {
  try {
    return callback();
  } catch (error) {
    throw new Error(`Falha na verificação: ${descricao}: ${error.message}`, { cause: error });
  }
}

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
  ["as ferramentas estruturais", /mcp__codegraph[\s\S]*codegraph_callers[\s\S]*codegraph_callees[\s\S]*codegraph_node[\s\S]*codegraph_impact[\s\S]*codegraph_search/],
  ["a preferência por grep para literais, rotas, configuração e Markdown", /grep[\s\S]*(?:literais|literal)[\s\S]*rotas[\s\S]*(?:config|configuração)[\s\S]*Markdown/i],
  ["fallback sem corrigir servidor ou índice ausentes", /servidor[\s\S]*(?:não existir|indisponível)[\s\S]*índice[\s\S]*(?:não existir|ausente)[\s\S]*grep/i],
  ["a proibição de inicializar ou indexar", /nunca[\s\S]*(?:init|index|sync)[\s\S]*\.codegraph\//i],
  ["a confirmação do trecho antes de citar linha", /(?:confirm|confira|confirme)[\s\S]*(?:leitura|ler)[\s\S]*(?:arquivo|trecho)[\s\S]*(?:arquivo:linha|linha)/i],
]) {
  verificar(`agents/scout.md deve conter ${descricao}`, () => assert.match(scout, ancora));
}

console.log("codegraph-mcp-config smoke: PASS");
