import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createProviderQuotaCollector } from "../users/provider-quotas.mjs";
import { createUserRuntime } from "../users/runtime.mjs";
import { registerUser } from "../users/registry.mjs";
import { fileURLToPath } from "node:url";

const now = Date.parse("2026-10-09T12:00:00.000Z");
const oauth = (fields = {}) => ({ type: "oauth", access: "synthetic-access", refresh: "synthetic-refresh", expires: now + 60_000, ...fields });
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });
const claude = { five_hour: { utilization: 61, resets_at: "2026-10-09T15:00:00.000Z" }, seven_day: { utilization: 25, resets_at: "2026-10-12T00:00:00.000Z" } };
const codex = { rate_limit: { primary_window: { used_percent: 37.5, limit_window_seconds: 14_400, reset_at: now / 1000 + 3600 }, secondary_window: { used_percent: 12, limit_window_seconds: 864_000, reset_after_seconds: 7200 } } };
const expectedUrl = { anthropic: "https://api.anthropic.com/api/oauth/usage", "openai-codex": "https://chatgpt.com/backend-api/wham/usage" };

function mockFetch(calls, replies = { anthropic: claude, "openai-codex": codex }) {
  return async (url, options) => {
    const provider = Object.keys(expectedUrl).find((key) => expectedUrl[key] === url);
    assert.ok(provider, `fixed provider endpoint only: ${url}`);
    calls.push({ provider, url, options });
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    return response(replies[provider]);
  };
}

test("collector validates OAuth quota DTOs, UTC reset units, and bounded fixed requests", async () => {
  const calls = [];
  const reads = [];
  const readProviderQuotas = createProviderQuotaCollector({
    readCredential: async (id) => { reads.push(id); return oauth({ accountId: id === "openai-codex" ? "synthetic-account" : undefined }); },
    fetchImpl: mockFetch(calls), now: () => now,
  });
  const report = await readProviderQuotas();
  assert.deepEqual(reads.sort(), ["anthropic", "openai-codex"]);
  assert.equal(calls.length, 2);
  const claudeReport = report.providers.find((item) => item.provider === "anthropic");
  assert.deepEqual(claudeReport.windows.map((item) => [item.durationSeconds, item.usedPercent, item.resetAt]), [
    [18_000, 61, "2026-10-09T15:00:00.000Z"], [604_800, 25, "2026-10-12T00:00:00.000Z"],
  ]);
  const codexReport = report.providers.find((item) => item.provider === "openai-codex");
  assert.deepEqual(codexReport.windows.map((item) => [item.durationSeconds, item.usedPercent, item.resetAt]), [
    [14_400, 37.5, "2026-10-09T13:00:00.000Z"], [864_000, 12, "2026-10-09T14:00:00.000Z"],
  ]);
  assert.equal(report.fetchedAt, "2026-10-09T12:00:00.000Z");
  assert.equal(claudeReport.fetchedAt, "2026-10-09T12:00:00.000Z");
  assert.equal(calls.find((call) => call.provider === "openai-codex").options.headers["ChatGPT-Account-Id"], "synthetic-account");
  assert.equal(calls.find((call) => call.provider === "anthropic").options.headers["anthropic-beta"], "oauth-2025-04-20");
  assert.doesNotMatch(JSON.stringify(report), /synthetic-access|synthetic-refresh|synthetic-account/);
});

test("Codex available reset count is optional, validated independently, and cached with its quota", async () => {
  const cases = [
    ["missing", {}, undefined],
    ["missing available_count", { rate_limit_reset_credits: {} }, undefined],
    ["null", { rate_limit_reset_credits: null }, undefined],
    ["zero", { rate_limit_reset_credits: { available_count: 0 } }, 0],
    ["three despite capped details", { rate_limit_reset_credits: { available_count: 3, credits: [{ id: "detail-a" }] } }, 3],
    ...[null, undefined, NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "3", true].map((available_count) => [String(available_count), { rate_limit_reset_credits: { available_count } }, undefined]),
  ];
  for (const [label, extra, expected] of cases) {
    const calls = [];
    const payload = { ...codex, ...extra };
    const reader = createProviderQuotaCollector({
      readCredential: async (provider) => oauth({ accountId: provider === "openai-codex" ? "synthetic-account" : undefined }),
      fetchImpl: async (url, options) => { calls.push(url); return response(url === expectedUrl["openai-codex"] ? payload : { ...claude, ...extra }); }, now: () => now,
    });
    const report = await reader();
    const codexResult = report.providers.find((item) => item.provider === "openai-codex");
    const claudeResult = report.providers.find((item) => item.provider === "anthropic");
    assert.equal(codexResult.bankedResets, expected, `${label} Codex count`);
    assert.equal(Object.hasOwn(codexResult, "bankedResets"), expected !== undefined, `${label} optional field presence`);
    assert.equal(codexResult.windows.length, 2, `${label} must not invalidate valid quota windows`);
    assert.equal(Object.hasOwn(claudeResult, "bankedResets"), false, `${label} Claude lookalike must be ignored`);
    assert.doesNotMatch(JSON.stringify(report), /detail-a|credits/);
    assert.equal(calls.length, 2);
  }

  let time = now;
  let access = "synthetic-access-one";
  let codexPayload = { ...codex, rate_limit_reset_credits: { available_count: 3, credits: [{ id: "detail-a" }] } };
  const calls = [];
  const reader = createProviderQuotaCollector({
    readCredential: async (provider) => oauth({ access, accountId: provider === "openai-codex" ? "synthetic-account" : undefined, expires: time + 60_000 }),
    fetchImpl: async (url) => { calls.push(url); return response(url === expectedUrl["openai-codex"] ? codexPayload : claude); }, now: () => time,
  });
  const first = await reader();
  const firstCodex = first.providers.find((item) => item.provider === "openai-codex");
  firstCodex.bankedResets = 99;
  firstCodex.windows[0].usedPercent = 99;
  const cached = await reader();
  const cachedCodex = cached.providers.find((item) => item.provider === "openai-codex");
  assert.equal(cachedCodex.bankedResets, 3);
  assert.equal(cachedCodex.windows[0].usedPercent, 37.5, "cache hits are clone-isolated");
  assert.equal(calls.length, 2);

  access = "synthetic-access-two";
  codexPayload = { ...codex, rate_limit_reset_credits: { available_count: 0 } };
  time += 1_000;
  const rotated = await reader();
  assert.equal(rotated.providers.find((item) => item.provider === "openai-codex").bankedResets, 0, "credential fingerprint change fetches new counter");
  assert.equal(calls.length, 4);

  codexPayload = { ...codex };
  time += 5 * 60 * 1000 + 1;
  const refreshed = await reader();
  const refreshedCodex = refreshed.providers.find((item) => item.provider === "openai-codex");
  assert.equal(Object.hasOwn(refreshedCodex, "bankedResets"), false, "refresh without a counter removes the previous optional value");
  assert.equal(calls.length, 6);
});

test("invalid, expired, unsupported, malformed and failed credentials never become quota zero", async () => {
  for (const credential of [undefined, { type: "api_key", key: "secret" }, oauth({ expires: now }), oauth({ expires: NaN }), oauth({ access: "" })]) {
    let fetches = 0;
    const reader = createProviderQuotaCollector({ readCredential: async () => credential, fetchImpl: async () => { fetches++; throw new Error("must not fetch"); }, now: () => now });
    const report = await reader();
    assert.equal(fetches, 0);
    assert.ok(report.providers.every((item) => item.unavailable && item.windows.length === 0));
  }
  for (const utilization of [NaN, Infinity, -1, 101, undefined]) {
    const calls = [];
    const reader = createProviderQuotaCollector({ readCredential: async () => oauth(), fetchImpl: mockFetch(calls, { anthropic: { ...claude, five_hour: { utilization, resets_at: claude.five_hour.resets_at } }, "openai-codex": codex }), now: () => now });
    const result = await reader();
    assert.equal(result.providers.find((item) => item.provider === "anthropic").unavailable, "invalid quota window");
    assert.equal(result.providers.find((item) => item.provider === "anthropic").windows.length, 0);
    assert.ok(calls.length <= 2);
  }
  const errorReader = createProviderQuotaCollector({ readCredential: async () => oauth({ accountId: "synthetic-account" }), fetchImpl: async () => ({ ok: false, status: 401, text: async () => "bearer leaked body" }), now: () => now });
  const errors = await errorReader();
  assert.ok(errors.providers.every((item) => item.unavailable));
  assert.doesNotMatch(JSON.stringify(errors), /bearer leaked body|synthetic-access/);
});

test("optional Claude and Codex windows are omitted, while malformed present windows and empty responses fail", async () => {
  const partialClaude = { five_hour: claude.five_hour, seven_day: null };
  const partialCodex = { rate_limit: { primary_window: codex.rate_limit.primary_window, secondary_window: null } };
  const calls = [];
  const reader = createProviderQuotaCollector({
    readCredential: async (provider) => oauth({ accountId: provider === "openai-codex" ? "synthetic-account" : undefined }),
    fetchImpl: async (url, options) => {
      calls.push(url);
      return response(url === expectedUrl.anthropic ? partialClaude : partialCodex);
    }, now: () => now,
  });
  const report = await reader();
  assert.equal(report.providers.find((item) => item.provider === "anthropic").windows.length, 1);
  assert.equal(report.providers.find((item) => item.provider === "openai-codex").windows.length, 1);
  assert.equal(report.providers.find((item) => item.provider === "openai-codex").windows[0].durationSeconds, 14_400);
  assert.equal(calls.length, 2);

  for (const payload of [
    { five_hour: null, seven_day: undefined },
    { five_hour: claude.five_hour, seven_day: { utilization: 20 } },
  ]) {
    const result = createProviderQuotaCollector({ readCredential: async () => oauth(), fetchImpl: async (url) => response(url === expectedUrl.anthropic ? payload : codex), now: () => now });
    const failed = await result();
    assert.equal(failed.providers.find((item) => item.provider === "anthropic").windows.length, 0);
    assert.match(failed.providers.find((item) => item.provider === "anthropic").unavailable, /invalid/);
  }
});

test("successful results cache only inside one collector and failures are not cached", async () => {
  let time = now;
  let reads = 0;
  let calls = 0;
  const readCredential = async () => { reads++; return oauth({ accountId: "synthetic-account", expires: time + 60_000 }); };
  const fetchImpl = async (url, options) => { calls++; return mockFetch([], { anthropic: claude, "openai-codex": codex })(url, options); };
  const reader = createProviderQuotaCollector({ readCredential, fetchImpl, now: () => time });
  await reader();
  await reader();
  assert.equal(reads, 4, "stored credentials are re-read before serving cached quota");
  assert.equal(calls, 2);
  time += 5 * 60 * 1000 + 1;
  await reader();
  assert.equal(calls, 4);
  const second = createProviderQuotaCollector({ readCredential, fetchImpl, now: () => time });
  await second();
  assert.equal(calls, 6, "no cross-instance cache");
  let attempts = 0;
  const unavailable = createProviderQuotaCollector({ readCredential: async () => oauth({ accountId: "synthetic-account", expires: time + 60_000 }), fetchImpl: async () => { attempts++; return { ok: false, text: async () => "private" }; }, now: () => time });
  await unavailable(); await unavailable();
  assert.equal(attempts, 4, "errors are not cached");
});

class FakeSessionManager {
  constructor(entries = []) { this.entries = entries; this.id = "synthetic-session"; }
  getEntries() { return this.entries; }
  getSessionId() { return this.id; }
  getHeader() { return { id: this.id }; }
  getBranch() { return this.entries; }
  appendCustomEntry(type, data) { this.entries.push({ type: "custom", customType: type, data }); }
}
const binding = (id) => ({ type: "custom", customType: "pi.account", data: { version: 1, accountId: id } });
const visibleWidth = (value) => {
  const plain = value.replace(/\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g, "");
  return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(plain)].reduce((width, { segment }) => {
    if (/^\p{Mark}+$/u.test(segment)) return width;
    return width + (/[\u1100-\u115f\u2329\u232a\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6\u{1f300}-\u{1faff}\u{20000}-\u{3fffd}]/u.test(segment) ? 2 : 1);
  }, 0);
};
function runtimeFixture({ accounts = ["alpha"], credentials = () => oauth(), fetchImpl, nowProvider = () => now } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "provider-quotas-"));
  const registryPath = path.join(root, "registry", "users.json");
  for (const id of accounts) registerUser({ registryPath, id, label: id, agentDir: path.join(root, "profiles", id, "agent"), sessionRoots: [path.join(root, "sessions", id)] });
  const storeReads = [];
  const factory = createUserRuntime(registryPath, {
    sdkRoot: path.join(root, "synthetic-sdk"), inheritedAccountId: accounts[0],
    createStore: (account) => ({ async read(providerId) { storeReads.push([account.id, providerId]); return credentials(account.id, providerId); } }),
    createModelRuntime: async () => ({}),
    providerQuotaFetch: fetchImpl,
    providerQuotaNow: nowProvider,
  });
  return { root, storeReads, factory };
}

async function loadedUsage(fixture, manager, agentDir) {
  const loaded = await fixture.factory({ purpose: "application", sessionManager: manager, sdkRoot: path.join(fixture.root, "synthetic-sdk"), agentDir });
  assert.equal(loaded.resourceLoaderOptions.extensionFactories.length, 2);
  const entries = [
    { resolvedPath: fileURLToPath(new URL("../../extensions/usuario.ts", import.meta.url)), commands: new Map() },
    { resolvedPath: fileURLToPath(new URL("../../extensions/session-usage.ts", import.meta.url)), commands: new Map() },
    { resolvedPath: path.join(agentDir, "extensions", "session-usage.ts"), commands: new Map() },
    { resolvedPath: "/synthetic/custom-session-usage.ts", commands: new Map() },
  ];
  assert.deepEqual(loaded.resourceLoaderOptions.extensionsOverride({ extensions: entries }).extensions.map((entry) => entry.resolvedPath), ["/synthetic/custom-session-usage.ts"]);
  let usageHandler;
  const pi = { getCommands: () => [], registerCommand(name, definition) { assert.equal(name, "usage"); usageHandler = definition.handler; }, sendMessage(message) { this.message = message; } };
  loaded.resourceLoaderOptions.extensionFactories[1].factory(pi);
  return { loaded, pi, usageHandler };
}

test("Claude-only managed /usage reuses its credential-bound quota across invocations", async () => {
  const calls = [];
  const fixture = runtimeFixture({
    credentials: (_account, provider) => provider === "anthropic" ? oauth() : undefined,
    fetchImpl: async (url, options) => { calls.push(url); return mockFetch([], { anthropic: claude, "openai-codex": codex })(url, options); },
  });
  const manager = new FakeSessionManager([binding("alpha")]);
  const { pi, usageHandler } = await loadedUsage(fixture, manager, path.join(fixture.root, "profiles", "alpha", "agent"));
  const ctx = { mode: "print", hasUI: false, sessionManager: manager };
  await usageHandler("", ctx);
  const first = pi.message.content;
  await usageHandler("", ctx);
  assert.equal(calls.length, 1, "missing Codex OAuth does not disable Claude's successful cache");
  assert.match(pi.message.content, /anthropic OAuth quota/);
  assert.match(pi.message.content, /openai-codex: unavailable/);
  assert.doesNotMatch(pi.message.content, /Cotas dos provedores: não consultadas/);
  assert.match(first, /Fetched 2026-10-09T12:00:00.000Z/);
});

test("managed /usage binds selected account, blocks manager mismatch, and renders quotas with local data", async () => {
  const calls = [];
  const fixture = runtimeFixture({ credentials: () => oauth({ accountId: "synthetic-account" }), fetchImpl: mockFetch(calls) });
  const manager = new FakeSessionManager([binding("alpha"), { type: "message", timestamp: "2026-10-09T10:00:00.000Z", message: { role: "assistant", provider: "local", model: "m", usage: { input: 3 } } }]);
  const { pi, usageHandler } = await loadedUsage(fixture, manager, path.join(fixture.root, "profiles", "alpha", "agent"));
  let panel;
  const ctx = { mode: "tui", hasUI: true, sessionManager: manager, ui: { custom: async (make) => { panel = make({}, { style: (text) => text, fg: (_color, text) => text }, {}, () => {}); } } };
  await usageHandler("", ctx);
  const rendered = panel.render(120).join("\n");
  assert.match(rendered, /PI account · alpha/);
  assert.match(rendered, /61% used/);
  assert.match(rendered, /39% remaining/);
  const stacked = panel.render(80).join("\n");
  const codexCard = stacked.slice(stacked.indexOf("Codex · OAuth"), stacked.indexOf("Fetched"));
  assert.match(codexCard, /4h window[\s\S]*37\.5% used[\s\S]*62\.5% remaining/);
  assert.match(codexCard, /10d window[\s\S]*12% used[\s\S]*88% remaining/);
  assert.match(rendered, /↺ 09 Oct 2026, 15:00 UTC/);
  assert.match(rendered, /Fetched 09 Oct 2026, 12:00 UTC/);
  assert.match(rendered, /local/);
  assert.match(rendered, /Model: m/);
  for (const width of [24, 40, 80, 120]) assert.ok(panel.render(width).every((line) => visibleWidth(line) <= width));
  assert.equal(calls.length, 2);
  assert.deepEqual(fixture.storeReads.map((entry) => entry[0]), ["alpha", "alpha"]);
  const mismatch = { ...ctx, sessionManager: new FakeSessionManager() };
  await usageHandler("", mismatch);
  assert.equal(calls.length, 2, "mismatched root must not fetch");
  assert.equal(fixture.storeReads.length, 2, "mismatched root must not read credentials");
});

test("managed metadata is inert; account-bound collectors do not share cache", async () => {
  let networkCalls = 0;
  const fixture = runtimeFixture({ accounts: ["alpha", "beta"], credentials: () => oauth({ accountId: "synthetic-account" }), fetchImpl: async (...args) => { networkCalls++; return mockFetch([], { anthropic: claude, "openai-codex": codex })(...args); } });
  await fixture.factory({ purpose: "metadata", sdkRoot: path.join(fixture.root, "synthetic-sdk"), agentDir: fixture.root });
  assert.equal(networkCalls, 0);
  const managerA = new FakeSessionManager([binding("alpha")]);
  const managerB = new FakeSessionManager([binding("beta")]);
  const alpha = await loadedUsage(fixture, managerA, path.join(fixture.root, "profiles", "alpha", "agent"));
  const betaFactory = createUserRuntime(path.join(fixture.root, "registry", "users.json"), {
    sdkRoot: path.join(fixture.root, "synthetic-sdk"), inheritedAccountId: "beta",
    createStore: (account) => ({ read: async (providerId) => oauth({ accountId: `${account.id}-${providerId}` }) }),
    createModelRuntime: async () => ({}), providerQuotaFetch: async (...args) => { networkCalls++; return mockFetch([], { anthropic: claude, "openai-codex": codex })(...args); }, providerQuotaNow: () => now,
  });
  const betaFixture = { ...fixture, factory: betaFactory };
  const beta = await loadedUsage(betaFixture, managerB, path.join(fixture.root, "profiles", "beta", "agent"));
  const use = async (loaded, manager) => loaded.usageHandler("", { mode: "print", hasUI: false, sessionManager: manager });
  await use(alpha, managerA); await use(beta, managerB);
  assert.equal(networkCalls, 4);
  assert.match(alpha.pi.message.content, /PI account alpha/);
  assert.match(beta.pi.message.content, /PI account beta/);
  assert.doesNotMatch(alpha.pi.message.content, /Cotas dos provedores: não consultadas/);
});

test("one provider 429 does not evict the other provider cache or refresh its timestamp", async () => {
  let time = now;
  const calls = [];
  const reader = createProviderQuotaCollector({
    readCredential: async (provider) => oauth({ accountId: provider === "openai-codex" ? "synthetic-account" : undefined, expires: time + 60_000 }),
    fetchImpl: async (url) => {
      calls.push(url);
      return url === expectedUrl.anthropic ? response(claude) : response({ secret: "not-for-output" }, 429);
    }, now: () => time,
  });
  const first = await reader();
  assert.equal(first.providers.find((item) => item.provider === "openai-codex").unavailable, "provider request unavailable");
  time += 30_000;
  const second = await reader();
  assert.equal(calls.filter((url) => url === expectedUrl.anthropic).length, 1);
  assert.equal(calls.filter((url) => url === expectedUrl["openai-codex"]).length, 2);
  assert.equal(second.providers.find((item) => item.provider === "anthropic").fetchedAt, first.providers.find((item) => item.provider === "anthropic").fetchedAt);
  assert.equal(second.fetchedAt, "2026-10-09T12:00:00.000Z", "mixed report time is the oldest successful snapshot");
  assert.doesNotMatch(JSON.stringify(second), /not-for-output/);
});

test("changed token still invalidates its own cache while another provider is missing", async () => {
  let access = "synthetic-claude-token-one";
  let time = now;
  let reads = 0;
  const calls = [];
  const reader = createProviderQuotaCollector({
    readCredential: async (provider) => { reads++; return provider === "anthropic" ? oauth({ access, expires: time + 60_000 }) : undefined; },
    fetchImpl: async (url) => { calls.push(url); return response(claude); }, now: () => time,
  });
  await reader(); await reader();
  assert.equal(calls.length, 1);
  assert.equal(reads, 4, "all current credentials are read before cache lookup");
  access = "synthetic-claude-token-two";
  time += 1_000;
  const rotated = await reader();
  assert.equal(calls.length, 2);
  assert.equal(rotated.providers.find((item) => item.provider === "openai-codex").unavailable, "OAuth credential unavailable or expired");
  assert.equal(rotated.fetchedAt, "2026-10-09T12:00:01.000Z");
});

test("expired provider invalidates only its own cache", async () => {
  let time = now;
  let expireCodex = false;
  const calls = [];
  const reader = createProviderQuotaCollector({
    readCredential: async (provider) => oauth({ accountId: provider === "openai-codex" ? "synthetic-account" : undefined, expires: provider === "openai-codex" && expireCodex ? time : time + 60_000 }),
    fetchImpl: async (url) => { calls.push(url); return response(url === expectedUrl.anthropic ? claude : codex); }, now: () => time,
  });
  await reader();
  assert.equal(calls.length, 2);
  expireCodex = true;
  time += 1_000;
  const expired = await reader();
  assert.equal(calls.length, 2, "Claude cache survives Codex expiry");
  assert.match(expired.providers.find((item) => item.provider === "openai-codex").unavailable, /expired/);
  expireCodex = false;
  const recovered = await reader();
  assert.equal(calls.filter((url) => url === expectedUrl.anthropic).length, 1);
  assert.equal(calls.filter((url) => url === expectedUrl["openai-codex"]).length, 2, "expired Codex cache was cleared and retried");
  assert.equal(calls.length, 3);
  assert.ok(recovered.providers.every((item) => !item.unavailable));
});

test("same-runtime credential changes and missing/expired auth never reuse old quota", async () => {
  let access = "synthetic-token-one";
  let credentialState = "valid";
  const sent = [];
  const fixture = runtimeFixture({
    credentials: () => credentialState === "missing" ? undefined : oauth({ access, accountId: "synthetic-account", expires: credentialState === "expired" ? now : now + 60_000 }),
    fetchImpl: async (url, options) => { sent.push(options.headers.authorization); return mockFetch([], { anthropic: claude, "openai-codex": codex })(url, options); },
  });
  const manager = new FakeSessionManager([binding("alpha")]);
  const { pi, usageHandler } = await loadedUsage(fixture, manager, path.join(fixture.root, "profiles", "alpha", "agent"));
  const ctx = { mode: "print", hasUI: false, sessionManager: manager };
  await usageHandler("", ctx);
  await usageHandler("", ctx);
  assert.equal(sent.length, 2);
  access = "synthetic-token-two";
  await usageHandler("", ctx);
  assert.equal(sent.length, 4, "changed stored OAuth access token cannot receive the previous cached quota");
  assert.ok(sent.slice(2).every((authorization) => authorization === "Bearer synthetic-token-two"));
  credentialState = "expired";
  await usageHandler("", ctx);
  assert.equal(sent.length, 4, "expired selected credentials cannot reuse cached quota");
  assert.match(pi.message.content, /unavailable/);
  credentialState = "missing";
  await usageHandler("", ctx);
  assert.equal(sent.length, 4, "missing selected credentials cannot reuse cached quota");
  assert.match(pi.message.content, /unavailable/);
});

test("unmanaged/default registration remains local-only", async () => {
  const { registerSessionUsage } = await import("../../extensions/session-usage.ts");
  let handler;
  const messages = [];
  registerSessionUsage({ getCommands: () => [], registerCommand(_name, definition) { handler = definition.handler; }, sendMessage(message) { messages.push(message); } });
  await handler("", { mode: "print", sessionManager: new FakeSessionManager([]) });
  assert.match(messages[0].content, /Cotas dos provedores: não consultadas/);
  assert.doesNotMatch(messages[0].content, /PI account|% used|resets/);
});
