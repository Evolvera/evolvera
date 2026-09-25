import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";
import { createTestSymlink } from "./lib/test-symlink.mjs";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDir, "../..");
const sandbox = mkdtempSync(path.join(tmpdir(), "codex-fast-mode-smoke-"));

try {
  const packageRoot = resolvePiSdkRoot(import.meta.url);
  const scopeDir = path.join(sandbox, "node_modules", "@earendil-works");
  mkdirSync(scopeDir, { recursive: true });
  createTestSymlink(packageRoot, path.join(scopeDir, "pi-coding-agent"), "dir");
  cpSync(path.join(root, "extensions", "codex-fast-mode.ts"), path.join(sandbox, "codex-fast-mode.ts"));
  const mod = await import(pathToFileURL(path.join(sandbox, "codex-fast-mode.ts")));

  const gpt56 = { provider: "openai-codex", id: "gpt-5.6-sol" };
  const gpt54 = { provider: "openai-codex", id: "gpt-5.4" };
  const astra = { provider: "openai-codex", id: "gpt-6-astra" };
  const gpt6Sol = { provider: "openai-codex", id: "gpt-6-sol" };
  const gpt6Luna = { provider: "openai-codex", id: "gpt-6-luna" };
  assert.equal(mod.isFastEligibleModel(gpt6Sol), true);
  assert.equal(mod.isFastEligibleModel(gpt6Luna), true);
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
  assert.match(commandOptions.get("fast").description, /\/fast on \| \/fast eco \| \/fast off/);
  assert.ok(handlers.has("session_start"));
  assert.ok(handlers.has("model_select"));
  assert.ok(handlers.has("before_provider_request"));
  assert.ok(handlers.has("after_provider_response"));

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
    },
  };

  await handlers.get("session_start")({ reason: "startup" }, ctx);
  const fastCommand = commandOptions.get("fast");
  let completions = await fastCommand.getArgumentCompletions("");
  assert.deepEqual(completions.map((item) => item.value), ["eco", "off"]);
  completions = await fastCommand.getArgumentCompletions("e");
  assert.deepEqual(completions.map((item) => item.value), ["eco"]);

  // Selecting a compatible GPT exposes on while keeping Fast off by default.
  ctx.model = gpt56;
  await handlers.get("model_select")({ model: gpt56, previousModel: claude, source: "set" }, ctx);
  assert.equal(notifications.length, 0);
  assert.equal(statuses.at(-1).text, undefined);
  completions = await fastCommand.getArgumentCompletions("");
  assert.deepEqual(completions.map((item) => item.value), ["on", "eco", "off"]);
  const defaultPayload = await handlers.get("before_provider_request")(
    { payload: { model: gpt56.id, service_tier: "default" } },
    ctx,
  );
  assert.equal(defaultPayload, undefined);

  // A separately-created child starts standard, then reads the owner's shared state dynamically.
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
    },
  };
  await child.handlers.get("session_start")({ reason: "startup" }, childCtx);
  const defaultChildPayload = await child.handlers.get("before_provider_request")(
    { payload: { model: gpt56.id } },
    childCtx,
  );
  assert.equal(defaultChildPayload, undefined);

  // Manual on injects the priority tier for both owner and child and reports request acceptance.
  await fastCommand.handler("on", ctx);
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
  const childFastPayload = await child.handlers.get("before_provider_request")(
    { payload: { model: gpt56.id } },
    childCtx,
  );
  assert.equal(childFastPayload.service_tier, "priority");
  await handlers.get("after_provider_response")({ status: 200, headers: {} }, ctx);
  assert.deepEqual(statuses.at(-1), { key: "codex-fast-mode", text: "⚡🟢" });

  // Eco keeps the owner standard while eligible children continue to use priority.
  await fastCommand.handler("eco", ctx);
  assert.deepEqual(statuses.at(-1), { key: "codex-fast-mode", text: "⚡ECO" });
  assert.match(notifications.at(-1).message, /sessão principal permanece no service tier padrão/);
  assert.match(notifications.at(-1).message, /apenas subagentes OpenAI Codex compatíveis usam Fast/);
  assert.equal(
    await handlers.get("before_provider_request")({ payload: { model: gpt56.id, service_tier: "default" } }, ctx),
    undefined,
  );
  assert.equal(
    (await child.handlers.get("before_provider_request")({ payload: { model: gpt56.id } }, childCtx)).service_tier,
    "priority",
  );

  // Eco remains active when the owner switches to an ineligible model, and off still works there.
  ctx.model = claude;
  await handlers.get("model_select")({ model: claude, previousModel: gpt56, source: "set" }, ctx);
  assert.deepEqual(statuses.at(-1), { key: "codex-fast-mode", text: "⚡ECO" });
  completions = await fastCommand.getArgumentCompletions("");
  assert.deepEqual(completions.map((item) => item.value), ["eco", "off"]);
  assert.equal(
    (await child.handlers.get("before_provider_request")({ payload: { model: gpt56.id } }, childCtx)).service_tier,
    "priority",
  );

  // Unsupported child models remain standard; returning to Codex restores child Fast.
  await child.handlers.get("model_select")({ model: spark, previousModel: gpt56, source: "set" }, childCtx);
  childCtx.model = spark;
  const childUnsupportedPayload = await child.handlers.get("before_provider_request")(
    { payload: { model: spark.id } },
    childCtx,
  );
  assert.equal(childUnsupportedPayload, undefined);
  childCtx.model = gpt56;
  await child.handlers.get("model_select")({ model: gpt56, previousModel: spark, source: "set" }, childCtx);
  assert.equal(
    (await child.handlers.get("before_provider_request")({ payload: { model: gpt56.id } }, childCtx)).service_tier,
    "priority",
  );

  // Child start/model change/shutdown never releases the owner's eco mode.
  await child.handlers.get("session_start")({ reason: "startup" }, childCtx);
  await child.handlers.get("model_select")({ model: spark, previousModel: gpt56, source: "set" }, childCtx);
  childCtx.model = gpt56;
  await child.handlers.get("model_select")({ model: gpt56, previousModel: spark, source: "set" }, childCtx);
  await child.handlers.get("session_shutdown")({ reason: "quit" }, childCtx);
  assert.deepEqual(statuses.at(-1), { key: "codex-fast-mode", text: "⚡ECO" });
  assert.equal(
    await handlers.get("before_provider_request")({ payload: { model: gpt56.id } }, ctx),
    undefined,
  );

  await fastCommand.handler("off", ctx);
  assert.equal(statuses.at(-1).text, undefined);
  const childAfterOwnerOff = await child.handlers.get("before_provider_request")(
    { payload: { model: gpt56.id } },
    childCtx,
  );
  assert.equal(childAfterOwnerOff, undefined);

  // Eco can be invoked by an ineligible Claude owner and still enables Codex children.
  await fastCommand.handler("eco", ctx);
  assert.deepEqual(statuses.at(-1), { key: "codex-fast-mode", text: "⚡ECO" });
  assert.match(notifications.at(-1).message, /sessão principal permanece no service tier padrão/);
  assert.equal(
    await handlers.get("before_provider_request")({ payload: { model: claude.id } }, ctx),
    undefined,
  );
  assert.equal(
    (await child.handlers.get("before_provider_request")({ payload: { model: gpt56.id } }, childCtx)).service_tier,
    "priority",
  );
  await fastCommand.handler("off", ctx);
  assert.equal(
    await child.handlers.get("before_provider_request")({ payload: { model: gpt56.id } }, childCtx),
    undefined,
  );

  // /fast on remains guarded for an ineligible owner, while eco was accepted there.
  await fastCommand.handler("on", ctx);
  assert.match(notifications.at(-1).message, /only for supported OpenAI Codex models/);
  ctx.model = gpt56;
  const notificationCount = notifications.length;
  await handlers.get("model_select")({ model: gpt56, previousModel: claude, source: "set" }, ctx);
  assert.equal(notifications.length, notificationCount);
  assert.equal(statuses.at(-1).text, undefined);
  const switchedBackPayload = await handlers.get("before_provider_request")({ payload: { model: gpt56.id } }, ctx);
  assert.equal(switchedBackPayload, undefined);

  // In all mode, an owner model change disables Fast for every extension instance.
  await fastCommand.handler("on", ctx);
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

  // A pre-/reload shared state with the old { enabled, ownerSessionId } shape remains usable.
  const sharedStateKey = Symbol.for("evolvera.codex-fast-mode.state");
  const currentSharedState = globalThis[sharedStateKey];
  globalThis[sharedStateKey] = { enabled: true, ownerSessionId: "legacy-owner-session" };
  const legacyChild = createExtensionHarness();
  const legacyChildCtx = {
    mode: "headless",
    model: gpt56,
    sessionManager: {
      getSessionId() {
        return "legacy-child-session";
      },
    },
    ui: {
      notify() {},
      setStatus() {},
    },
  };
  await legacyChild.handlers.get("session_start")({ reason: "startup" }, legacyChildCtx);
  const legacyPayload = await legacyChild.handlers.get("before_provider_request")(
    { payload: { model: gpt56.id } },
    legacyChildCtx,
  );
  assert.equal(legacyPayload.service_tier, "priority");
  globalThis[sharedStateKey] = currentSharedState;

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
