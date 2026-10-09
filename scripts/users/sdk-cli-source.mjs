import { createHash } from "node:crypto";

const SDK = "@earendil-works/pi-coding-agent";
const VERSION = "1.0.1";
const PINNED = {
  "dist/main.js": "060521b0b81f91948d8ded9139e423e5d0c9e6808a45c81750cc30519de4d2db",
  "dist/migrations.js": "8514d2573b028baeba60635498a1c5f129a602abd203ea5c37a63df2eea3fb6b",
  "dist/core/model-runtime.js": "da26f76339a031456f6d239a249159231776f760ab4ac538c6b54c417dea6f67",
  "dist/core/model-config.js": null,
};
const hash = (text) => createHash("sha256").update(text).digest("hex");
function once(source, anchor, replacement, label) {
  const first = source.indexOf(anchor);
  if (first < 0 || source.indexOf(anchor, first + anchor.length) >= 0) throw new Error(`expected one ${label} anchor`);
  return source.slice(0, first) + replacement + source.slice(first + anchor.length);
}
function validateText(source, label) {
  if (typeof source !== "string") throw new TypeError(`${label} source must be text`);
}

export function transformMainSource(source) {
  validateText(source, "main");
  const digest = hash(source);
  if (digest !== PINNED["dist/main.js"]) throw new Error("SDK main source pin mismatch");
  let out = source;
  out = once(out, "async function runAuthCommand(args) {", "async function runAuthCommand(args, accountRuntimeFactory) {", "runAuthCommand declaration");
  out = once(out, "            const modelRuntime = await ModelRuntime.create({ allowModelNetwork: false, signal });\n            const credential = await resolveCredentialForPrint(parsed, modelRuntime, command.kind, command.minExpiryMs, signal);", "            const account = accountRuntimeFactory ? await accountRuntimeFactory({ purpose: \"auth-command\", parsed, command, readonly: command.noRefresh === true, signal, cwd: process.cwd(), agentDir: getAgentDir() }) : undefined;\n            if (accountRuntimeFactory && !account?.modelRuntime) throw new Error('account runtime factory did not supply a ModelRuntime');\n            const modelRuntime = accountRuntimeFactory ? account.modelRuntime : await ModelRuntime.create({ allowModelNetwork: false, signal });\n            const credential = await resolveCredentialForPrint(parsed, modelRuntime, command.kind, command.minExpiryMs, signal);", "auth print runtime");
  out = once(out, "            const credentials = command.noRefresh ? new ReadOnlyAuthStorage() : AuthStorage.create();\n            const modelRuntime = await createAuthCheckModelRuntime(credentials);", "            const account = accountRuntimeFactory ? await accountRuntimeFactory({ purpose: \"auth-command\", parsed, command, requestedAuth, readonly: command.noRefresh, signal: AbortSignal.timeout(15_000), cwd: process.cwd(), agentDir: getAgentDir() }) : undefined;\n            const credentials = accountRuntimeFactory ? account.credentials : (command.noRefresh ? new ReadOnlyAuthStorage() : AuthStorage.create());\n            if (accountRuntimeFactory && (!account?.credentials || !account?.modelRuntime)) throw new Error('account runtime factory did not supply auth services');\n            const modelRuntime = accountRuntimeFactory ? account.modelRuntime : await createAuthCheckModelRuntime(credentials);", "auth check runtime/store");
  out = once(out, "    const extensionFactories = [...builtInExtensions, ...(options?.extensionFactories ?? [])];", "    const extensionFactories = [...builtInExtensions, ...(options?.extensionFactories ?? [])];\n    const accountRuntimeFactory = options?.accountRuntimeFactory;", "main factory option");
  out = once(out, "    if (await runAuthCommand(args)) {", "    if (await runAuthCommand(args, accountRuntimeFactory)) {", "runAuthCommand call");
  out = once(out, "    const { migratedAuthProviders: migratedProviders, deprecationWarnings } = runMigrations(cwd);", "    const { migratedAuthProviders: migratedProviders, deprecationWarnings } = runMigrations(cwd, accountRuntimeFactory ? { skipAuthMigration: true } : undefined);", "managed migrations call");
  out = once(out, "    const projectTrustByCwd = new Map();", "    const projectTrustByCwd = new Map();\n    let predecessorSessionManager;", "predecessor manager capture");
  out = once(out, "        const services = await createAgentSessionServices({\n            cwd,", "        const account = accountRuntimeFactory ? await accountRuntimeFactory({ purpose: parsed.help ? \"metadata\" : \"application\", sessionManager, predecessorSessionManager: sessionStartEvent === undefined ? undefined : predecessorSessionManager, sessionStartEvent, cwd, agentDir, parsed, modelRuntimeTimeoutMs: 15_000, readonly: parsed.help === true || parsed.listModels !== undefined }) : undefined;\n        if (accountRuntimeFactory && !account?.modelRuntime) throw new Error('account runtime factory did not supply a ModelRuntime');\n        const nativeResourceLoaderOptions = {\n                additionalExtensionPaths: resolvedExtensionPaths,\n                additionalSkillPaths: resolvedSkillPaths,\n                additionalPromptTemplatePaths: resolvedPromptTemplatePaths,\n                additionalThemePaths: resolvedThemePaths,\n                noExtensions: parsed.noExtensions,\n                noSkills: parsed.noSkills,\n                noPromptTemplates: parsed.noPromptTemplates,\n                noThemes: parsed.noThemes,\n                noContextFiles: parsed.noContextFiles,\n                systemPrompt: parsed.systemPrompt,\n                appendSystemPrompt: parsed.appendSystemPrompt,\n                extensionFactories,\n            };\n        const suppliedResources = account?.resourceLoaderOptions ?? {};\n        const resourceLoaderOptions = { ...nativeResourceLoaderOptions, extensionFactories: [...extensionFactories, ...(suppliedResources.extensionFactories ?? [])], ...(typeof suppliedResources.extensionsOverride === \"function\" ? { extensionsOverride: suppliedResources.extensionsOverride } : {}) };\n        const services = await createAgentSessionServices({\n            cwd,", "pre-services account factory");
  out = once(out, "            modelRuntimeSignal: AbortSignal.timeout(15_000),", "            modelRuntimeSignal: AbortSignal.timeout(15_000),\n            ...(account ? { modelRuntime: account.modelRuntime } : {}),", "selected model runtime");
  out = once(out, "            resourceLoaderOptions: {\n                additionalExtensionPaths: resolvedExtensionPaths,\n                additionalSkillPaths: resolvedSkillPaths,\n                additionalPromptTemplatePaths: resolvedPromptTemplatePaths,\n                additionalThemePaths: resolvedThemePaths,\n                noExtensions: parsed.noExtensions,\n                noSkills: parsed.noSkills,\n                noPromptTemplates: parsed.noPromptTemplates,\n                noThemes: parsed.noThemes,\n                noContextFiles: parsed.noContextFiles,\n                systemPrompt: parsed.systemPrompt,\n                appendSystemPrompt: parsed.appendSystemPrompt,\n                extensionFactories,\n            },", "            resourceLoaderOptions,", "bounded resource options");
  out = once(out, "        return {\n            ...created,\n            services,\n            diagnostics,\n        };", "        const result = { ...created, services, diagnostics };\n        predecessorSessionManager = sessionManager;\n        return result;", "successful native runtime capture");
  return out;
}

export function transformMigrationsSource(source) {
  validateText(source, "migrations");
  if (hash(source) !== PINNED["dist/migrations.js"]) throw new Error("SDK migrations source pin mismatch");
  let out = once(source, "export function runMigrations(cwd) {", "export function runMigrations(cwd, options) {", "runMigrations declaration");
  out = once(out, "    const migratedAuthProviders = migrateAuthToAuthJson();", "    const migratedAuthProviders = options?.skipAuthMigration === true ? [] : migrateAuthToAuthJson();", "auth migration call");
  return out;
}

export const sdkCliPins = Object.freeze({ packageName: SDK, version: VERSION, sources: Object.freeze(PINNED) });
