import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { createUserCredentialStore } from "../users/credentials.mjs";
import { registerUser } from "../users/registry.mjs";
import {
  createAccountConfigPolicy,
  createSealedAccountAuthContext,
  transformModelConfigSource,
  transformModelRuntimeSource,
} from "../users/sdk-auth-source.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const sdkRoot = "C:/Users/kevin/AppData/Local/nvm/v24.20.0/node_modules/@earendil-works/pi-coding-agent";
const sdkPins = [
  ["package.json", "fa487897918283976006d8c4f450772a9c90b9674f2a19d5f01e3ab9af35ce8f"],
  ["dist/main.js", "060521b0b81f91948d8ded9139e423e5d0c9e6808a45c81750cc30519de4d2db"],
  ["dist/core/model-runtime.js", "da26f76339a031456f6d239a249159231776f760ab4ac538c6b54c417dea6f67"],
  ["dist/core/model-runtime.d.ts", "5a7aac47a83c20316f593c74798f60ec4e521a0fddff03a0608dbc5514012bf5"],
  ["dist/core/agent-session-services.js", "20b7aa4b0657b53fb522ea051df26f72901802e03cc06c89e0a8926388bca601"],
  ["dist/core/model-config.js", "68c447ff2ef729331713e044dae41b7416dbafbf96c83773308e2eb9c3f86107"],
  ["dist/core/provider-composer.js", "dba201a60ec5b0832dc52cf3d9736c4d470169150b16fcaf989e43427b9ffd5b"],
  ["dist/core/resolve-config-value.js", "01fdb1673990635bb419c7418eefa298b6a1c6fbb3c6193d3b05a4902e51992d"],
  ["node_modules/@earendil-works/pi-ai/dist/auth/context.js", "5d0ea91a2fd2acf84e3b9717ce59e75006933c68d8efa91873894a9d963d41a0"],
  ["node_modules/@earendil-works/pi-ai/dist/models.js", "2efdb7beab5730e2a77163c807b3648a97cd4593d0bda462eb79f69f0630613f"],
].map(([relative, expected]) => [path.join(sdkRoot, relative), expected]);
const protectedCandidates = [
  ["scripts/patch-pi-101-interactive-activity.mjs", "e47429c2e2c20393cc57fa561b897ad126d0008994ca36d75779d7a0b9e1f48f"],
  ["scripts/test/patch-pi-101-interactive-activity.smoke.mjs", "075f4e8450f97560d60d00be20cd91e45808306ce40beccb09f42be577ca4423"],
].map(([relative, expected]) => [path.join(repoRoot, relative), expected]);
const presentProtectedPins = protectedCandidates.filter(([file]) => fs.existsSync(file));
const absentProtectedPins = protectedCandidates.filter(([file]) => !fs.existsSync(file)).map(([file]) => file);
const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function verifyPins() {
  for (const [file, expected] of [...sdkPins, ...presentProtectedPins]) assert.equal(hash(file), expected, `protected source changed: ${file}`);
  for (const file of absentProtectedPins) assert.equal(fs.existsSync(file), false, `protected source appeared during test: ${file}`);
}
verifyPins();
const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), "auth-only-sdk-auth-"));
const resources = {
  runRoot,
  statefulResources: ["fresh run-owned synthetic registry, profile auth.json files, fake SDK lock module, source fixture files"],
  prohibitedResources: [".env", "inherited credentials", "real SDK imports/main", "provider/network", "historical runtime roots"],
  staticReadAllowlist: [...sdkPins.map(([file]) => file), ...protectedCandidates.map(([file]) => file)],
  protectedPins: presentProtectedPins.map(([file, expected]) => ({ file, expectedHash: expected })),
  protectedAbsent: absentProtectedPins,
};
fs.writeFileSync(path.join(runRoot, "resource-manifest.json"), `${JSON.stringify(resources, null, 2)}\n`, { flag: "wx" });

let fakeSdkRoot;
function fakeLockSdk() {
  if (fakeSdkRoot) return fakeSdkRoot;
  const root = path.join(runRoot, "fake-sdk");
  const packageDir = path.join(root, "node_modules", "proper-lockfile");
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), '{"name":"fake-sdk","version":"1.0.0","type":"module"}\n', { flag: "wx" });
  fs.writeFileSync(path.join(packageDir, "package.json"), '{"name":"proper-lockfile","version":"4.1.2","main":"index.cjs"}\n', { flag: "wx" });
  fs.writeFileSync(path.join(packageDir, "index.cjs"), `const fs = require("node:fs");\nmodule.exports = { lock(target, options = {}) { if (options.realpath !== false || options.retries !== 0 || options.stale !== 30000 || options.update !== 15000) throw new Error("unexpected lock protocol"); const lockPath = target + ".lock"; try { fs.mkdirSync(lockPath); } catch (error) { if (error.code === "EEXIST") { const locked = Object.assign(new Error("locked"), { code: "ELOCKED" }); throw locked; } throw error; } const identity = fs.lstatSync(lockPath); let released = false; return Promise.resolve(async () => { if (released) return; released = true; const current = fs.lstatSync(lockPath); if (current.dev !== identity.dev || current.ino !== identity.ino || current.birthtimeMs !== identity.birthtimeMs) { const compromised = new Error("lock identity changed"); options.onCompromised?.(compromised); throw compromised; } (options.fs || fs).rmdirSync(lockPath); }); } };\n`, { flag: "wx" });
  fakeSdkRoot = root;
  return root;
}

let accountOrdinal = 0;
function makeAccounts(count = 3) {
  const registryPath = path.join(runRoot, "registry.json");
  const accounts = [];
  for (let index = 0; index < count; index++) {
    const id = `account-${++accountOrdinal}`;
    const agentDir = path.join(runRoot, id);
    fs.mkdirSync(agentDir, { recursive: true });
    accounts.push(registerUser({ registryPath, id, label: id, agentDir }));
  }
  return accounts;
}

const configSource = fs.readFileSync(path.join(sdkRoot, "dist/core/model-config.js"), "utf8");
const runtimeSource = fs.readFileSync(path.join(sdkRoot, "dist/core/model-runtime.js"), "utf8");
const resolverSource = fs.readFileSync(path.join(sdkRoot, "dist/core/resolve-config-value.js"), "utf8");

test("source hooks are exact-version, fail closed on anchor drift, and keep optional native defaults", () => {
  assert.equal(JSON.parse(fs.readFileSync(path.join(sdkRoot, "package.json"), "utf8")).version, "1.0.1");
  const transformedRuntime = transformModelRuntimeSource(runtimeSource);
  const transformedConfig = transformModelConfigSource(configSource);
  assert.match(transformedRuntime, /createModels\(\{ credentials, modelsStore, authContext: this\.authContext \}\)/);
  assert.ok(transformedRuntime.indexOf("this.authContext = authContext") < transformedRuntime.indexOf("this.models = createModels"));
  assert.ok(transformedRuntime.indexOf("this.accountConfigPolicy = accountConfigPolicy") < transformedRuntime.indexOf("this.models = createModels"));
  assert.match(transformedRuntime, /ModelConfig\.load\(this\.modelsPath, this\.accountConfigPolicy\?\.filterConfig\)/);
  assert.match(transformedRuntime, /options\.accountConfigPolicy\?\.filterConfig/);
  assert.match(transformedRuntime, /this\.accountConfigPolicy\.filterRegistration\(config\)/);
  assert.match(transformedConfig, /typeof transform === "function" \? transform\(config\.providers\) : config\.providers/);
  assert.throws(() => transformModelRuntimeSource(runtimeSource.replace("createModels({ credentials, modelsStore })", "createModels({ credentials })")), /anchor mismatch/);
  assert.throws(() => transformModelConfigSource(`${configSource}\n${configSource.match(/        const config = parsed;\n        const providers = new Map\(\);/)[0]}`), /anchor mismatch/);
  assert.doesNotMatch(runtimeSource, /accountConfigPolicy|authContext/);
  assert.equal((transformedRuntime.match(/rebuildProviders\(\);/g) || []).length > 0, true);

  const call = transformedRuntime.match(/this\.models = (createModels\(\{ credentials, modelsStore, authContext: this\.authContext \}\));/)[1];
  const received = {};
  vm.runInNewContext(call, {
    credentials: {}, modelsStore: {}, authContext: { env: async () => undefined },
    createModels(options) { received.options = options; return {}; },
  });
  assert.deepEqual(Object.keys(received.options).sort(), ["authContext", "credentials", "modelsStore"]);
  assert.equal(typeof received.options.authContext.env, "function");

  const policy = { filterConfig: (providers) => Object.fromEntries(Object.entries(providers).map(([id, provider]) => [id, { ...provider, apiKey: undefined }])) };
  const policyExpression = transformedConfig.match(/const policyProviders = (.*);/)[1];
  const policyVm = { transform: policy.filterConfig, config: { providers: { provider: { apiKey: "must-not-compose", baseUrl: "https://owned.invalid" } } } };
  vm.runInNewContext(`globalThis.policyProviders = ${policyExpression}`, policyVm);
  assert.equal(policyVm.policyProviders.provider.apiKey, undefined);
  assert.equal(policyVm.policyProviders.provider.baseUrl, "https://owned.invalid");

  const registrationLine = transformedRuntime.match(/(config = this\.accountConfigPolicy \? this\.accountConfigPolicy\.filterRegistration\(config\) : config;)/)[1];
  const registrationVm = { config: { apiKey: "unowned" }, accountConfigPolicy: { filterRegistration: (value) => { const { apiKey, ...safe } = value; return safe; } } };
  vm.runInNewContext(registrationLine, registrationVm);
  assert.deepEqual(registrationVm.config, {});
});

test("prepared create, refresh, and registration filter before composition with sealed auth", async () => {
  const preparedRuntimeSource = transformModelRuntimeSource(runtimeSource).replace("new ModelRuntime(", "new SyntheticModelRuntime(");
  const constructorStart = preparedRuntimeSource.indexOf("    constructor(credentials,");
  const classPrefix = preparedRuntimeSource.slice(preparedRuntimeSource.indexOf("export class ModelRuntime {"), constructorStart)
    .replace("export class ModelRuntime {", "class SyntheticModelRuntime {");
  const extractMethod = (start, end) => {
    const from = preparedRuntimeSource.indexOf(start);
    const to = preparedRuntimeSource.indexOf(end, from + start.length);
    assert.ok(from >= 0 && to > from, `source method anchors missing: ${start}`);
    return preparedRuntimeSource.slice(from, to);
  };
  const extracted = [
    extractMethod("    constructor(credentials, config, modelsPath, modelsStore, providers, modelNetworkEnabled, authContext, accountConfigPolicy)", "    static async create(options = {})"),
    extractMethod("    static async create(options = {})", "    configureRadiusProviders()"),
    extractMethod("    async refresh(options = {})", "    registerNativeProvider(provider)"),
    extractMethod("    registerProvider(providerId, config)", "    unregisterProvider(providerId)"),
  ].join("\n");
  const harnessTail = `
    events = globalThis.events;
    rebuildProviders() { this.events.push({ type: "composition", providers: this.config.providers }); }
    configureRadiusProviders() {}
    recomposeProvider(providerId) { this.events.push({ type: "recompose", providerId, config: this.extensionProviders.get(providerId) ?? this.config.getProvider(providerId) }); }
    updateModelSnapshot() {}
    markProvisionallyConfigured() {}
    async refreshProviderAvailability(providerId) { this.events.push({ type: "availability", providerId }); }
    async queueAvailabilityRefresh() { this.events.push({ type: "availability-all" }); }
  }
  globalThis.SyntheticModelRuntime = SyntheticModelRuntime;`;
  const events = [];
  let lastModelsOptions;
  let configLoads = 0;
  const rawCatalog = { cloud: { apiKey: "$AMBIENT_AUTH", headers: { Authorization: "$AMBIENT_HEADER" }, authHeader: true, oauth: "radius", baseUrl: "https://catalog.invalid", models: [{ id: "m", headers: { Authorization: "$AMBIENT_HEADER" }, contextWindow: 100 }] } };
  class FakeModelConfig {
    static async load(_path, filter) {
      configLoads++;
      events.push({ type: "config-policy", policy: typeof filter });
      const providers = typeof filter === "function" ? filter(rawCatalog) : rawCatalog;
      return { providers, getProvider: (id) => providers[id], getProviderIds: () => Object.keys(providers) };
    }
  }
  const context = {
    events,
    ModelConfig: FakeModelConfig,
    RuntimeCredentials: class { constructor(value) { this.value = value; } },
    DefaultAuthStorage: { create: () => ({}) },
    FileModelsStore: class {},
    InMemoryCodingAgentModelsStore: class {},
    builtinProviderCatalog: { getBuiltinModelDataGeneratedAt: () => "fixed", builtinProviders: () => [{ id: "cloud" }] },
    withRemoteCatalog: (provider) => provider,
    join: (...parts) => parts.join("/"), dirname: (value) => value,
    getAgentDir: () => "/synthetic-agent",
    createModels(options) {
      events.push({ type: "models", authContext: options.authContext });
      lastModelsOptions = options;
      return { refresh: async () => ({ errors: new Map() }) };
    },
    validateExtensionProvider() {},
    configuredRequestAuthStatus: () => undefined,
    operationSignal: (signal) => signal,
    process: { env: {} },
    AbortController,
    AbortSignal,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(`${classPrefix}${extracted}${harnessTail}`, context);
  const Synthetic = context.SyntheticModelRuntime;
  const ownerDir = path.join(runRoot, `runtime-evolvera-${++accountOrdinal}`);
  fs.mkdirSync(ownerDir, { recursive: true });
  const owner = registerUser({ registryPath: path.join(runRoot, `runtime-registry-${accountOrdinal}.json`), id: "evolvera", label: "Evolvera", agentDir: ownerDir, adoptExisting: true });
  const policy = createAccountConfigPolicy({ profile: owner, env: { ACCOUNT_API: "selected-api", ACCOUNT_HEADER: "selected-header", REGISTERED_KEY: "registered-secret" } });
  const authContext = createSealedAccountAuthContext({ env: { ACCOUNT_API: "selected-api" } });
  const runtime = await Synthetic.create({ credentials: {}, modelsPath: "synthetic-models", modelsStore: {}, authContext, accountConfigPolicy: policy, refreshOnCreate: false });
  assert.equal(lastModelsOptions.authContext, authContext);
  assert.ok(events.findIndex((entry) => entry.type === "models") < events.findIndex((entry) => entry.type === "composition"));
  const initialComposition = events.find((entry) => entry.type === "composition");
  assert.deepEqual(JSON.parse(JSON.stringify(initialComposition.providers)), { cloud: { authHeader: true, oauth: "radius", baseUrl: "https://catalog.invalid", models: [{ id: "m", contextWindow: 100 }] } });
  assert.equal(events.find((entry) => entry.type === "config-policy").policy, "function");

  await runtime.refresh({ providers: ["cloud"], allowNetwork: false });
  const refreshComposition = events.filter((entry) => entry.type === "recompose").at(-1);
  assert.deepEqual(JSON.parse(JSON.stringify(refreshComposition.config)), initialComposition.providers.cloud);
  assert.equal(events.filter((entry) => entry.type === "config-policy").length, 2);

  const nativeLogin = () => "native";
  runtime.registerProvider("extension", { apiKey: "$REGISTERED_KEY", headers: { Authorization: "$AMBIENT_HEADER" }, oauth: { login: nativeLogin }, baseUrl: "https://extension.invalid" });
  const registered = runtime.extensionProviders.get("extension");
  assert.deepEqual(JSON.parse(JSON.stringify(registered)), { apiKey: "registered-secret", oauth: {}, baseUrl: "https://extension.invalid" });
  assert.equal(registered.oauth.login, nativeLogin);
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(events.some((entry) => entry.type === "availability-all"));
  assert.ok(events.some((entry) => entry.type === "recompose" && entry.providerId === "extension" && entry.config.apiKey === "registered-secret"));
  assert.ok(configLoads >= 3, "create, refresh, and registration-triggered refresh each load filtered config");

  const unmanagedEvents = [];
  const unmanagedContext = { ...context, events: unmanagedEvents, createModels(options) { unmanagedEvents.push(options); return { refresh: async () => ({ errors: new Map() }) }; } };
  vm.runInNewContext(`${classPrefix}${extracted}${harnessTail}`, unmanagedContext);
  const unmanaged = await unmanagedContext.SyntheticModelRuntime.create({ credentials: {}, modelsPath: "synthetic-models", modelsStore: {}, refreshOnCreate: false });
  assert.equal(unmanaged.authContext, undefined);
  assert.equal(unmanaged.accountConfigPolicy, undefined);
  assert.equal(unmanagedEvents[0].authContext, undefined);
});

test("sealed context and shared catalog policy isolate auth while preserving metadata and OAuth functions", async () => {
  const values = { OWNED_KEY: "account-secret" };
  const context = createSealedAccountAuthContext({ env: values, files: ["/owned/config"] });
  values.OWNED_KEY = "mutated";
  assert.equal(await context.env("OWNED_KEY"), "account-secret");
  assert.equal(await context.env("AMBIENT_ONLY"), undefined);
  assert.equal(await context.fileExists("/owned/config"), true);
  assert.equal(await context.fileExists("/ambient/config"), false);
  assert.throws(() => createSealedAccountAuthContext({ env: { BAD: 1 } }), /string map/);

  const profile = makeAccounts(1)[0];
  const policy = createAccountConfigPolicy({ profile, env: { OWNED_KEY: "account-secret" } });
  const oauthLogin = () => "native-oauth";
  const shared = {
    cloud: { apiKey: "$SHARED", headers: { Authorization: "$HEADER" }, authHeader: true, oauth: "radius", baseUrl: "https://api.invalid", api: "openai-completions", compat: { supportsStore: false }, name: "Cloud", models: [{ id: "m", api: "openai-completions", headers: { "X-Model": "shared" }, contextWindow: 64000 }], modelOverrides: { m: { headers: { "X-Override": "shared" }, cost: { input: 2 } } } },
  };
  const filtered = policy.filterConfig(shared);
  assert.deepEqual(filtered.cloud, { authHeader: true, oauth: "radius", baseUrl: "https://api.invalid", api: "openai-completions", compat: { supportsStore: false }, name: "Cloud", models: [{ id: "m", api: "openai-completions", contextWindow: 64000 }], modelOverrides: { m: { cost: { input: 2 } } } });
  assert.equal(shared.cloud.apiKey, "$SHARED");
  const registration = policy.filterRegistration({ apiKey: "$OTHER", headers: { Authorization: "$OTHER" }, authHeader: false, oauth: { login: oauthLogin }, baseUrl: "https://owned.invalid", models: [{ id: "m", headers: { X: "secret" }, cost: { output: 3 } }] });
  assert.deepEqual(registration, { authHeader: false, oauth: { login: oauthLogin }, baseUrl: "https://owned.invalid", models: [{ id: "m", cost: { output: 3 } }] });
  assert.equal(registration.oauth.login, oauthLogin);
  const previousRegistration = policy.filterRegistration({ apiKey: "$OLD", headers: { Authorization: "$OLD" } });
  const reRegistered = policy.filterRegistration({ ...previousRegistration, ...policy.filterRegistration({ baseUrl: "https://new.invalid" }) });
  assert.deepEqual(reRegistered, { baseUrl: "https://new.invalid" });
  const ownerDir = path.join(runRoot, "evolvera");
  fs.mkdirSync(ownerDir, { recursive: true });
  const owner = registerUser({ registryPath: path.join(runRoot, "registry.json"), id: "evolvera", label: "Evolvera", agentDir: ownerDir, adoptExisting: true });
  const declaredEnv = { DECLARED: "owner-secret", LITERAL: "!starts-with-bang $NEXT", DOLLAR_VALUE: "price$TOKEN", NEXT: "ambient-never-used" };
  const ownerPolicy = createAccountConfigPolicy({ profile: owner, env: declaredEnv });
  declaredEnv.DECLARED = "must-not-change-account-authority";
  assert.deepEqual(ownerPolicy.filterConfig(shared).cloud, { authHeader: true, oauth: "radius", baseUrl: "https://api.invalid", api: "openai-completions", compat: { supportsStore: false }, name: "Cloud", models: [{ id: "m", api: "openai-completions", headers: { "X-Model": "shared" }, contextWindow: 64000 }], modelOverrides: { m: { headers: { "X-Override": "shared" }, cost: { input: 2 } } } });
  const adopted = ownerPolicy.filterConfig({ cloud: {
    apiKey: "$DECLARED", headers: { Authorization: "$AMBIENT_AUTH", "X-Missing": "${MISSING_AUTH}", "X-Escaped": "$LITERAL", "X-Command": "!echo never-run", "X-Literal": "adopted-literal", "X-Dollar": "$DOLLAR_VALUE", "X-EnvEscape": "$$AMBIENT_AUTH" },
    models: [{ id: "m", headers: { Authorization: "$DECLARED" } }], modelOverrides: { m: { headers: { Authorization: "${MISSING_AUTH}" }, cost: { input: 1 } } },
    authHeader: true, oauth: { login: oauthLogin }, baseUrl: "https://owned.invalid",
  } });
  assert.deepEqual(adopted.cloud, {
    apiKey: "owner-secret", headers: { "X-Escaped": "$!starts-with-bang $$NEXT", "X-Literal": "adopted-literal", "X-Dollar": "price$$TOKEN", "X-EnvEscape": "$$AMBIENT_AUTH" },
    models: [{ id: "m", headers: { Authorization: "owner-secret" } }], modelOverrides: { m: { cost: { input: 1 } } },
    authHeader: true, oauth: { login: oauthLogin }, baseUrl: "https://owned.invalid",
  });
  const adoptedRegistration = ownerPolicy.filterRegistration({ apiKey: "$DECLARED", headers: { Authorization: "$AMBIENT_AUTH" }, oauth: { login: oauthLogin } });
  assert.deepEqual(adoptedRegistration, { apiKey: "owner-secret", oauth: { login: oauthLogin } });
  assert.equal(adoptedRegistration.oauth.login, oauthLogin);
  const parserStart = resolverSource.indexOf("function appendLiteral(parts, value)");
  const parserEnd = resolverSource.indexOf("function getTemplateEnvVarNames(parts)", parserStart);
  const resolverStart = resolverSource.indexOf("function resolveTemplate(parts, env)", parserEnd);
  const resolverEnd = resolverSource.indexOf("export function getConfigValueEnvVarName", resolverStart);
  assert.ok(parserStart >= 0 && parserEnd > parserStart && resolverStart > parserEnd && resolverEnd > resolverStart);
  const parserVm = { process: { env: { AMBIENT_AUTH: "ambient-must-not-be-used", NEXT: "ambient-must-not-be-used" } } };
  vm.runInNewContext(`${resolverSource.slice(parserStart, parserEnd)}${resolverSource.slice(resolverStart, resolverEnd)}; globalThis.parseConfigValueReference = parseConfigValueReference; globalThis.resolveTemplate = resolveTemplate;`, parserVm);
  for (const [encoded, expected] of [[adopted.cloud.headers["X-Escaped"], "!starts-with-bang $NEXT"], [adopted.cloud.headers["X-Dollar"], "price$TOKEN"], [adopted.cloud.headers["X-EnvEscape"], "$AMBIENT_AUTH"]]) {
    const reference = parserVm.parseConfigValueReference(encoded);
    assert.equal(reference.type, "template");
    assert.equal(parserVm.resolveTemplate(reference.parts, {}), expected);
  }
  assert.throws(() => createAccountConfigPolicy({ profile: Object.freeze({ id: "forged" }) }), /registry-issued/);
});

test("accountEnv is snapshotted, explicit, masks empties, and keeps unqualified historical expansion", async () => {
  const [one, two, three] = makeAccounts();
  const lockRoot = fakeLockSdk();
  const previous = process.env.AUTH_ONLY_AMBIENT;
  process.env.AUTH_ONLY_AMBIENT = "ambient-secret";
  try {
    const accountEnv = { ACCOUNT_KEY: "one-secret", EMPTY_KEY: "" };
    const store1 = createUserCredentialStore(one, { sdkRoot: lockRoot, accountEnv, lockTimeoutMs: 0 });
    accountEnv.ACCOUNT_KEY = "mutated";
    const store2 = createUserCredentialStore(two, { sdkRoot: lockRoot, accountEnv: { ACCOUNT_KEY: "two-secret" }, lockTimeoutMs: 0 });
    const store3 = createUserCredentialStore(three, { sdkRoot: lockRoot, accountEnv: {}, lockTimeoutMs: 0 });
    await store1.modify("provider", () => ({ type: "api_key", key: "$ACCOUNT_KEY/$$/$!" }));
    await store1.modify("brace", () => ({ type: "api_key", key: "${ACCOUNT_KEY}" }));
    await store1.modify("declared", () => ({ type: "api_key", key: "$DECLARED_KEY", env: { DECLARED_KEY: "credential-owned" } }));
    await store1.modify("mask", () => ({ type: "api_key", key: "$AUTH_ONLY_AMBIENT", env: { AUTH_ONLY_AMBIENT: "" } }));
    await store1.modify("empty", () => ({ type: "api_key", key: "$EMPTY_KEY" }));
    await store1.modify("ambient", () => ({ type: "api_key", key: "$AUTH_ONLY_AMBIENT" }));
    await store1.modify("inherited-constructor", () => ({ type: "api_key", key: "$constructor" }));
    await store1.modify("inherited-tostring", () => ({ type: "api_key", key: "${toString}" }));
    await store1.modify("command", () => ({ type: "api_key", key: "!command $ACCOUNT_KEY" }));
    await store2.modify("provider", () => ({ type: "api_key", key: "$ACCOUNT_KEY" }));
    await store3.modify("provider", () => ({ type: "api_key", key: "$ACCOUNT_KEY" }));
    assert.equal((await store1.read("provider")).key, "one-secret/$/!");
    assert.equal((await store1.read("brace")).key, "one-secret");
    assert.equal((await store1.read("declared")).key, "credential-owned");
    assert.equal((await store1.read("mask")).key, undefined);
    assert.equal((await store1.read("ambient")).key, undefined);
    assert.equal((await store1.read("inherited-constructor")).key, undefined);
    assert.equal((await store1.read("inherited-tostring")).key, undefined);
    assert.equal((await store1.read("empty")).key, undefined);
    assert.equal((await store1.read("command")).key, "!command $ACCOUNT_KEY");
    assert.equal((await store2.read("provider")).key, "two-secret");
    assert.equal((await store3.read("provider")).key, undefined);

    const unqualified = createUserCredentialStore(one, { sdkRoot: lockRoot, lockTimeoutMs: 0 });
    await unqualified.modify("legacy", () => ({ type: "api_key", key: "$EMPTY_KEY", env: { EMPTY_KEY: "" } }));
    process.env.EMPTY_KEY = "legacy-ambient";
    assert.equal((await unqualified.read("legacy")).key, "legacy-ambient");
    delete process.env.EMPTY_KEY;

    const other = createUserCredentialStore(two, { sdkRoot: lockRoot, accountEnv: { ACCOUNT_KEY: "two-secret" }, lockTimeoutMs: 0 });
    assert.equal((await other.read("provider")).key, "two-secret");
    assert.deepEqual(await store1.list(), [
      { providerId: "provider", type: "api_key" }, { providerId: "brace", type: "api_key" }, { providerId: "declared", type: "api_key" }, { providerId: "mask", type: "api_key" }, { providerId: "empty", type: "api_key" }, { providerId: "ambient", type: "api_key" }, { providerId: "inherited-constructor", type: "api_key" }, { providerId: "inherited-tostring", type: "api_key" }, { providerId: "command", type: "api_key" }, { providerId: "legacy", type: "api_key" },
    ]);
    await store1.delete("provider");
    assert.equal(await store1.read("provider"), undefined);
    assert.equal((await store2.read("provider")).key, "two-secret");
    assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(path.join(one.agentDir, "auth.json"), "utf8")), "provider"), false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(two.agentDir, "auth.json"), "utf8")).provider.key, "$ACCOUNT_KEY");
    assert.equal(fs.existsSync(path.join(three.agentDir, "auth.json")), true);
  } finally {
    if (previous === undefined) delete process.env.AUTH_ONLY_AMBIENT;
    else process.env.AUTH_ONLY_AMBIENT = previous;
  }
});

test("synthetic lock contention and FIFO queue use only run-owned auth targets", async () => {
  const [profile] = makeAccounts(1);
  const lockRoot = fakeLockSdk();
  const store = createUserCredentialStore(profile, { sdkRoot: lockRoot, accountEnv: {}, lockTimeoutMs: 0 });
  const authPath = path.join(profile.agentDir, "auth.json");
  fs.writeFileSync(authPath, "{}\n", { flag: "wx" });
  const lockPath = `${authPath}.lock`;
  fs.mkdirSync(lockPath);
  await assert.rejects(store.read("provider"), (error) => error.code === "CREDENTIAL_LOCK_TIMEOUT");
  fs.rmdirSync(lockPath);
  await store.modify("provider", () => ({ type: "api_key", key: "queued" }));
  const [first, second] = await Promise.all([store.read("provider"), store.read("provider")]);
  assert.deepEqual([first.key, second.key], ["queued", "queued"]);
  assert.equal(fs.existsSync(lockPath), false);
});

test("synthetic fixture records its exclusive resource boundary and protected hashes", () => {
  assert.equal(fs.realpathSync.native(runRoot), runRoot);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(runRoot, "resource-manifest.json"), "utf8")), resources);
  verifyPins();
});
