import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

// STATEFUL RESOURCE PROOF: DISPOSABLE_VERIFIED. Agent files live in a fresh mkdtemp root removed in finally;
// the model registry is an in-memory fake. No network, credentials, or PI process.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sdkRoot = resolvePiSdkRoot(import.meta.url);
const require = createRequire(import.meta.url);
const { createJiti } = require(path.join(sdkRoot, "node_modules/jiti/lib/jiti.cjs"));
const jiti = createJiti(import.meta.url, { fsCache: false, alias: { "@earendil-works/pi-coding-agent": path.join(sdkRoot, "dist/index.js") } });
const m = await jiti.import(path.join(root, "extensions/provider-login-check.ts"));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "provider-login-check-"));
try {
  const write = (name, model) => fs.writeFileSync(path.join(dir, name), `---\nname: ${name}\nmodel: ${model}\nthinking: high\n---\nbody\n`);
  write("builder.md", "openai-codex/gpt-6.1-terra");
  write("builder-design.md", "anthropic/claude-sonnet-5-5");
  write("website-designer.md", "anthropic/claude-opus-5-5");
  write("agent-expert.md", "inherit");
  const routes = m.routedProviders(dir);
  assert.deepEqual([...routes.keys()].sort(), ["anthropic", "openai-codex"], "inherit is not a provider route");
  assert.deepEqual(routes.get("anthropic").agents.sort(), ["builder-design", "website-designer"]);
  assert.equal(m.routedProviders(path.join(dir, "missing")).size, 0);

  const handlers = new Map();
  const notes = [];
  m.default({ on: (name, handler) => handlers.set(name, handler) }, dir);
  let finds = 0;
  const ctx = {
    hasUI: true,
    ui: { notify: (text, level) => notes.push([text, level]) },
    modelRegistry: {
      find: (provider, id) => { finds++; return { provider, id }; },
      getApiKeyAndHeaders: async (model) => {
        if (model.provider === "anthropic") throw new Error("OAuth refresh failed for anthropic");
        return { ok: true, apiKey: "x" };
      },
    },
  };
  const primary = { systemPrompt: "# PI Coding Agent\nbase", systemPromptOptions: { customPrompt: "# PI Coding Agent\nbase" } };
  const first = await handlers.get("before_agent_start")(primary, ctx);
  assert.match(first.systemPrompt, /## Unavailable providers this session/);
  assert.match(first.systemPrompt, /- anthropic: (builder-design, website-designer|website-designer, builder-design)/);
  assert.doesNotMatch(first.systemPrompt, /openai-codex:/, "working providers are not listed");
  assert.equal(notes.length, 1);
  assert.match(notes[0][0], /Login vencido em anthropic: rode \/login/);
  assert.equal(notes[0][1], "warning");

  const second = await handlers.get("before_agent_start")(primary, ctx);
  assert.match(second.systemPrompt, /anthropic/, "the note is added on every primary turn");
  assert.equal(finds, 2, "auth is resolved once per session, not per turn");
  assert.equal(notes.length, 1, "the user is warned once");

  const sub = await handlers.get("before_agent_start")({ systemPrompt: "sub", systemPromptOptions: { customPrompt: "You are a scout" } }, ctx);
  assert.equal(sub, undefined, "subagent sessions are left alone");

  const okHandlers = new Map();
  m.default({ on: (name, handler) => okHandlers.set(name, handler) }, dir);
  const okCtx = { ...ctx, modelRegistry: { find: (p, id) => ({ p, id }), getApiKeyAndHeaders: async () => ({ ok: true }) } };
  assert.equal(await okHandlers.get("before_agent_start")(primary, okCtx), undefined, "nothing changes when every login works");
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log("provider-login-check smoke: PASS");
