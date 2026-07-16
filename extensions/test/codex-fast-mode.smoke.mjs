import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDir, "../..");
const sandbox = mkdtempSync(path.join(tmpdir(), "codex-fast-mode-smoke-"));

try {
  const packageRoot = path.resolve(root, "../../npm-global/lib/node_modules/@earendil-works/pi-coding-agent");
  const scopeDir = path.join(sandbox, "node_modules", "@earendil-works");
  mkdirSync(scopeDir, { recursive: true });
  symlinkSync(packageRoot, path.join(scopeDir, "pi-coding-agent"), "dir");
  cpSync(path.join(root, "extensions", "codex-fast-mode.ts"), path.join(sandbox, "codex-fast-mode.ts"));
  const mod = await import(pathToFileURL(path.join(sandbox, "codex-fast-mode.ts")));

  const gpt56 = { provider: "openai-codex", id: "gpt-5.6-sol" };
  const gpt54 = { provider: "openai-codex", id: "gpt-5.4" };
  const spark = { provider: "openai-codex", id: "gpt-5.3-codex-spark" };
  const claude = { provider: "anthropic", id: "claude-fable-5" };

  assert.equal(mod.isFastEligibleModel(gpt56), true);
  assert.equal(mod.isFastEligibleModel(gpt54), true);
  assert.equal(mod.isFastEligibleModel(spark), false);
  assert.equal(mod.isFastEligibleModel(claude), false);
  assert.equal(mod.creditMultiplierFor(gpt56), "2,5×");
  assert.equal(mod.creditMultiplierFor(gpt54), "2×");
  assert.deepEqual(mod.applyFastServiceTier({ model: "gpt-5.6-sol", service_tier: "default" }), {
    model: "gpt-5.6-sol",
    service_tier: "priority",
  });

  const handlers = new Map();
  const commandOptions = new Map();
  mod.default({
    registerCommand(name, options) {
      commandOptions.set(name, options);
    },
    on(name, handler) {
      handlers.set(name, handler);
    },
  });

  assert.ok(commandOptions.has("fast"));
  assert.ok(handlers.has("session_start"));
  assert.ok(handlers.has("model_select"));
  assert.ok(handlers.has("before_provider_request"));
  assert.ok(handlers.has("after_provider_response"));

  let autocompleteFactory;
  const notifications = [];
  const statuses = [];
  const ctx = {
    mode: "tui",
    model: claude,
    ui: {
      notify(message, type) {
        notifications.push({ message, type });
      },
      setStatus(key, text) {
        statuses.push({ key, text });
      },
      addAutocompleteProvider(factory) {
        autocompleteFactory = factory;
      },
    },
  };

  await handlers.get("session_start")({ reason: "startup" }, ctx);
  assert.equal(typeof autocompleteFactory, "function");

  const baseProvider = {
    async getSuggestions() {
      return {
        prefix: "/",
        items: [
          { value: "fast", label: "fast" },
          { value: "model", label: "model" },
        ],
      };
    },
    applyCompletion(lines, cursorLine, cursorCol) {
      return { lines, cursorLine, cursorCol };
    },
  };
  const wrapped = autocompleteFactory(baseProvider);
  let suggestions = await wrapped.getSuggestions(["/"], 0, 1, { signal: new AbortController().signal });
  assert.deepEqual(suggestions.items.map((item) => item.value), ["model"]);

  // Fast is off by default even when an eligible model becomes active.
  ctx.model = gpt56;
  await handlers.get("model_select")({ model: gpt56, previousModel: claude, source: "set" }, ctx);
  const unchanged = await handlers.get("before_provider_request")({ payload: { model: gpt56.id } }, ctx);
  assert.equal(unchanged, undefined);
  suggestions = await wrapped.getSuggestions(["/"], 0, 1, { signal: new AbortController().signal });
  assert.deepEqual(suggestions.items.map((item) => item.value), ["fast", "model"]);

  await commandOptions.get("fast").handler("on", ctx);
  assert.match(notifications.at(-1).message, /1,5× mais rápido/);
  assert.match(notifications.at(-1).message, /2,5× mais consumo/);
  assert.equal(notifications.at(-1).type, "warning");
  assert.deepEqual(statuses.at(-1), { key: "codex-fast-mode", text: "⚡🟡" });

  const fastPayload = await handlers.get("before_provider_request")(
    { payload: { model: gpt56.id, service_tier: "default" } },
    ctx,
  );
  assert.equal(fastPayload.service_tier, "priority");
  await handlers.get("after_provider_response")({ status: 200, headers: {} }, ctx);
  assert.deepEqual(statuses.at(-1), { key: "codex-fast-mode", text: "⚡🟢" });

  // Switching away hides the option/status and prevents tier injection.
  ctx.model = claude;
  await handlers.get("model_select")({ model: claude, previousModel: gpt56, source: "set" }, ctx);
  suggestions = await wrapped.getSuggestions(["/"], 0, 1, { signal: new AbortController().signal });
  assert.deepEqual(suggestions.items.map((item) => item.value), ["model"]);
  assert.equal(statuses.at(-1).text, undefined);
  const claudePayload = await handlers.get("before_provider_request")({ payload: { model: claude.id } }, ctx);
  assert.equal(claudePayload, undefined);

  // Direct invocation remains guarded even though autocomplete hides it.
  await commandOptions.get("fast").handler("on", ctx);
  assert.match(notifications.at(-1).message, /only for supported OpenAI Codex models/);

  ctx.model = gpt56;
  await handlers.get("model_select")({ model: gpt56, previousModel: claude, source: "set" }, ctx);
  await commandOptions.get("fast").handler("off", ctx);
  assert.match(notifications.at(-1).message, /desativado/);
  assert.equal(statuses.at(-1).text, undefined);
  const offPayload = await handlers.get("before_provider_request")({ payload: { model: gpt56.id } }, ctx);
  assert.equal(offPayload, undefined);

  console.log("codex-fast-mode smoke: PASS");
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
