// Garante que o settings.json instalado compacta a conversa com folga para a
// resposta. O PI limita a saída a (janela − conversa − 4096); com a reserva
// padrão (16384) a compactação chega tarde e as respostas são cortadas com
// "maximum output token limit". Só lê config/settings.json do repo.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const settings = JSON.parse(readFileSync(path.join(root, "config/settings.json"), "utf8"));
const reserve = settings.compaction?.reserveTokens;
assert.ok(Number.isInteger(reserve) && reserve >= 65536,
  `config/settings.json precisa de compaction.reserveTokens >= 65536 (atual: ${reserve})`);
const models = JSON.parse(readFileSync(path.join(root, "config/models.json"), "utf8"));
const antigravity = models.providers?.antigravity;
assert.deepEqual(antigravity?.modelOverrides?.["gemini-4-argon"], {
  name: "Gemini 4 Argon (Antigravity)",
  contextWindow: 1048576,
  maxTokens: 65536,
});
assert.equal(antigravity.models, undefined,
  "Argon must be discovered from the account catalog, not invented as a static model");
assert.equal(antigravity.apiKey, undefined, "Antigravity must use OAuth, not an API key");
console.log("config-settings ok: reserveTokens =", reserve, "; Argon discovery-only override PASS");
