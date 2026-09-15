import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
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
  const astra = { provider: "openai-codex", id: "gpt-6-astra" };
  const spark = { provider: "openai-codex", id: "gpt-5.3-codex-spark" };
  const claude = { provider: "anthropic", id: "claude-fable-5" };

  assert.equal(mod.isFastEligibleModel(gpt56), true);
  assert.equal(mod.isFastEligibleModel(gpt54), true);
  assert.equal(mod.isFastEligibleModel(astra), true);
  assert.equal(mod.isFastEligibleModel(spark), false);
  assert.equal(mod.isFastEligibleModel(claude), false);
  assert.equal(mod.creditMultiplierFor(gpt56), "2,5×");
  assert.equal(mod.creditMultiplierFor(gpt54), "2×");
  assert.deepEqual(mod.applyFastServiceTier({ model: "gpt-5.6-sol", service_tier: "default" }), {
    model: "gpt-5.6-sol",
    service_tier: "priority",
  });

  function createExtensionHarness() {
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
    return { handlers, commandOptions };
  }

  const { handlers, commandOptions } = createExtensionHarness();
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
    sessionManager: {
      getSessionId() {
        return "owner-session";
      },
    },
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

  // Selecting a compatible GPT exposes the command but keeps Fast off by default.
  ctx.model = gpt56;
  await handlers.get("model_select")({ model: gpt56, previousModel: claude, source: "set" }, ctx);
  assert.equal(notifications.length, 0);
  assert.equal(statuses.at(-1).text, undefined);
  suggestions = await wrapped.getSuggestions(["/"], 0, 1, { signal: new AbortController().signal });
  assert.deepEqual(suggestions.items.map((item) => item.value), ["fast", "model"]);
  const defaultPayload = await handlers.get("before_provider_request")(
    { payload: { model: gpt56.id, service_tier: "default" } },
    ctx,
  );
  assert.equal(defaultPayload, undefined);

  // Manual on injects the priority tier and reports request acceptance.
  await commandOptions.get("fast").handler("on", ctx);
  assert.match(notifications.at(-1).message, /^Fast Mode ativado:/);
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

  // A separately-created child instance reads the owner's shared state dynamically.
  const child = createExtensionHarness();
  const childCtx = {
    mode: "headless",
    model: gpt56,
    sessionManager: {
      getSessionId() {
        return "child-session";
      },
    },
    ui: {
      notify() {},
      setStatus() {},
      addAutocompleteProvider() {},
    },
  };
  await child.handlers.get("session_start")({ reason: "startup" }, childCtx);
  const childFastPayload = await child.handlers.get("before_provider_request")(
    { payload: { model: gpt56.id } },
    childCtx,
  );
  assert.equal(childFastPayload.service_tier, "priority");

  // Child model changes and shutdown do not release the owner's Fast mode.
  await child.handlers.get("model_select")({ model: spark, previousModel: gpt56, source: "set" }, childCtx);
  childCtx.model = spark;
  const childUnsupportedPayload = await child.handlers.get("before_provider_request")(
    { payload: { model: spark.id } },
    childCtx,
  );
  assert.equal(childUnsupportedPayload, undefined);
  assert.equal(
    (await handlers.get("before_provider_request")({ payload: { model: gpt56.id } }, ctx)).service_tier,
    "priority",
  );
  childCtx.model = gpt56;
  await child.handlers.get("model_select")({ model: gpt56, previousModel: spark, source: "set" }, childCtx);
  assert.equal(
    (await child.handlers.get("before_provider_request")({ payload: { model: gpt56.id } }, childCtx)).service_tier,
    "priority",
  );

  await commandOptions.get("fast").handler("off", ctx);
  assert.equal(statuses.at(-1).text, undefined);
  const childAfterOwnerOff = await child.handlers.get("before_provider_request")(
    { payload: { model: gpt56.id } },
    childCtx,
  );
  assert.equal(childAfterOwnerOff, undefined);

  // Re-enable to prove child shutdown also leaves the owner in control.
  await commandOptions.get("fast").handler("on", ctx);
  assert.equal(
    (await child.handlers.get("before_provider_request")({ payload: { model: gpt56.id } }, childCtx)).service_tier,
    "priority",
  );
  await child.handlers.get("session_shutdown")({ reason: "quit" }, childCtx);
  assert.equal(
    (await handlers.get("before_provider_request")({ payload: { model: gpt56.id } }, ctx)).service_tier,
    "priority",
  );

  await commandOptions.get("fast").handler("off", ctx);
  const manuallyOff = await handlers.get("before_provider_request")({ payload: { model: gpt56.id } }, ctx);
  assert.equal(manuallyOff, undefined);

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
  const notificationCount = notifications.length;
  await handlers.get("model_select")({ model: gpt56, previousModel: claude, source: "set" }, ctx);
  assert.equal(notifications.length, notificationCount);
  assert.equal(statuses.at(-1).text, undefined);
  const switchedBackPayload = await handlers.get("before_provider_request")({ payload: { model: gpt56.id } }, ctx);
  assert.equal(switchedBackPayload, undefined);

  // Owner model changes disable Fast for every extension instance.
  await commandOptions.get("fast").handler("on", ctx);
  await handlers.get("model_select")({ model: claude, previousModel: gpt56, source: "set" }, ctx);
  const afterOwnerModelChange = await child.handlers.get("before_provider_request")(
    { payload: { model: gpt56.id } },
    childCtx,
  );
  assert.equal(afterOwnerModelChange, undefined);

  // Owner shutdown resets the registry; a fresh root starts Fast off.
  ctx.model = gpt56;
  const freshOwner = createExtensionHarness();
  const freshCtx = {
    mode: "headless",
    model: gpt56,
    sessionManager: {
      getSessionId() {
        return "fresh-owner-session";
      },
    },
    ui: {
      notify() {},
      setStatus() {},
      addAutocompleteProvider() {},
    },
  };
  await handlers.get("session_shutdown")({ reason: "quit" }, ctx);
  await freshOwner.handlers.get("session_start")({ reason: "startup" }, freshCtx);
  const newSessionPayload = await freshOwner.handlers.get("before_provider_request")(
    { payload: { model: gpt56.id } },
    freshCtx,
  );
  assert.equal(newSessionPayload, undefined);

  // Astra is eligible and receives the priority service tier after explicit activation.
  ctx.model = astra;
  await handlers.get("model_select")({ model: astra, previousModel: gpt56, source: "set" }, ctx);
  await commandOptions.get("fast").handler("on", ctx);
  const astraPayload = await handlers.get("before_provider_request")({ payload: { model: astra.id } }, ctx);
  assert.deepEqual(astraPayload, { model: astra.id, service_tier: "priority" });

  for (const agentName of [
    "app-validator",
    "builder-heavy",
    "plan-briefer-gpt55",
    "plan-briefer",
    "planner",
    "qa",
    "validator",
  ]) {
    const frontmatter = readFileSync(path.join(root, "agents", `${agentName}.md`), "utf8");
    assert.match(frontmatter, /^extensions: \[codex-fast-mode\]$/m, agentName);
  }
  assert.match(readFileSync(path.join(root, "agents", "deep-research-auditor.md"), "utf8"), /^isolated: true$/m);
  assert.match(readFileSync(path.join(root, "agents", "plan-briefer-fable.md"), "utf8"), /^extensions: false$/m);

  console.log("codex-fast-mode smoke: PASS");
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
