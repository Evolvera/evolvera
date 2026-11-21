import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sdkRoot = resolvePiSdkRoot(import.meta.url);
const require = createRequire(import.meta.url);
const { createJiti } = require(path.join(sdkRoot, "node_modules/jiti/lib/jiti.cjs"));
const jiti = createJiti(import.meta.url, { fsCache: false, alias: { "@earendil-works/pi-coding-agent": path.join(sdkRoot, "dist/index.js") } });

import { spawnSync } from "node:child_process";

// STATEFUL RESOURCE PROOF: NO_STATEFUL_RESOURCES. Pure in-memory checks plus child node processes that only exit.
const m = await jiti.import(path.join(root, "extensions/quota-exit.ts"));

for (const text of [
  "429 You exceeded your current quota, please check your plan and billing details",
  "402 Payment Required", "insufficient_credits", "Your credit balance is too low", "ChatGPT usage limit reached",
  "quota exceeded for this project", "RESOURCE_EXHAUSTED", "Error: 429 usage cap hit",
]) assert.equal(m.isQuotaExhausted(text), true, text);
for (const text of ["429 Too Many Requests: rate limit, retry in 2s", "rate_limit_exceeded", "overloaded_error", "connection reset", undefined, 429])
  assert.equal(m.isQuotaExhausted(text), false, String(text));

const code = (mode, errorMessage, stopReason = "error") => {
  const script = `
    const { createJiti } = require(${JSON.stringify(path.join(sdkRoot, "node_modules/jiti/lib/jiti.cjs"))});
    const jiti = createJiti(${JSON.stringify(import.meta.url)}, { fsCache: false });
    (async () => {
      const m = await jiti.import(${JSON.stringify(path.join(root, "extensions/quota-exit.ts"))});
      const handlers = new Map();
      m.default({ on: (name, handler) => handlers.set(name, handler) });
      const end = (messages) => handlers.get("agent_end")({ messages }, { mode: ${JSON.stringify(mode)} });
      await end([{ role: "assistant", stopReason: ${JSON.stringify(stopReason)}, errorMessage: ${JSON.stringify(errorMessage)} }]);
      if (process.env.RECOVER) await end([{ role: "assistant", stopReason: "stop", content: [] }]);
      process.exitCode = 1;
    })();`;
  return spawnSync(process.execPath, ["-e", script], { encoding: "utf8", env: { ...process.env, JITI_FS_CACHE: "0" } });
};
const quota = "429 You exceeded your current quota";
const result = code("print", quota);
assert.equal(result.status, 75, result.stderr);
assert.equal(code("json", quota).status, 75);
assert.equal(code("tui", quota).status, 1, "interactive untouched");
assert.equal(code("print", "429 rate limit, retry later").status, 1, "plain rate limit keeps the generic status");
assert.equal(code("print", quota, "aborted").status, 1, "aborted run keeps the generic status");
assert.equal(spawnSync(process.execPath, ["-e", "0"]).status, 0);
console.log("quota-exit smoke: PASS");
