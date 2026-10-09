import { requireContext } from "./registry.mjs";

const fail = (message) => { throw new Error(`SDK auth source refused: ${message}`); };

function replaceOnce(source, anchor, replacement, label) {
  if (typeof source !== "string") fail(`${label}: source must be text`);
  const first = source.indexOf(anchor);
  if (first < 0 || source.indexOf(anchor, first + anchor.length) !== -1) fail(`${label}: anchor mismatch`);
  return source.slice(0, first) + replacement + source.slice(first + anchor.length);
}

function cloneConfigValue(value) {
  if (Array.isArray(value)) return value.map(cloneConfigValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneConfigValue(entry)]));
}
function withoutAuthValues(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const copy = cloneConfigValue(value);
  delete copy.apiKey;
  delete copy.headers;
  if (Array.isArray(copy.models)) copy.models = copy.models.map(withoutAuthValues);
  if (copy.modelOverrides && typeof copy.modelOverrides === "object") {
    for (const [id, override] of Object.entries(copy.modelOverrides)) {
      if (override && typeof override === "object") {
        copy.modelOverrides[id] = { ...override };
        delete copy.modelOverrides[id].headers;
      }
    }
  }
  return copy;
}

function resolveOwnedAuthString(value, env, allowLiteral) {
  if (value.startsWith("!")) return undefined;
  let referenced = false;
  let escapedToken = false;
  let missing = false;
  const resolved = value.replace(/\$(\$|!|\{[A-Za-z_][A-Za-z0-9_]*\}|[A-Za-z_][A-Za-z0-9_]*)/g, (_match, token) => {
    if (token === "$" || token === "!") { escapedToken = true; return token; }
    referenced = true;
    const name = token.startsWith("{") ? token.slice(1, -1) : token;
    if (!Object.hasOwn(env, name) || env[name] === "") { missing = true; return ""; }
    return env[name];
  });
  if (missing || referenced && !resolved) return undefined;
  if (!referenced && !escapedToken && !allowLiteral) return undefined;
  // Replacement values are not rescanned; encode the result once for the native resolver.
  const unescaped = resolved;
  if (!referenced && !escapedToken) return unescaped;
  const escaped = unescaped.startsWith("!")
    ? `$!${unescaped.slice(1).replace(/\$/g, "$$$$")}`
    : unescaped.replace(/\$/g, "$$$$");
  return escaped;
}

function sanitizeReferenceAuth(value, env, allowLiteral = true) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return cloneConfigValue(value);
  const copy = cloneConfigValue(value);
  if (Object.hasOwn(copy, "apiKey")) {
    const resolved = typeof copy.apiKey === "string" ? resolveOwnedAuthString(copy.apiKey, env, allowLiteral) : undefined;
    if (resolved === undefined) delete copy.apiKey;
    else copy.apiKey = resolved;
  }
  if (copy.headers && typeof copy.headers === "object" && !Array.isArray(copy.headers)) {
    for (const [name, header] of Object.entries(copy.headers)) {
      const resolved = typeof header === "string" ? resolveOwnedAuthString(header, env, allowLiteral) : undefined;
      if (resolved === undefined) delete copy.headers[name];
      else copy.headers[name] = resolved;
    }
    if (Object.keys(copy.headers).length === 0) delete copy.headers;
  }
  if (Array.isArray(copy.models)) copy.models = copy.models.map((model) => sanitizeReferenceAuth(model, env, allowLiteral));
  if (copy.modelOverrides && typeof copy.modelOverrides === "object") {
    for (const [id, override] of Object.entries(copy.modelOverrides)) {
      copy.modelOverrides[id] = sanitizeReferenceAuth(override, env, allowLiteral);
    }
  }
  return copy;
}

/** A sealed pi-ai auth context: only explicit account-owned env names/files resolve. */
export function createSealedAccountAuthContext({ env = {}, files = [] } = {}) {
  if (!env || typeof env !== "object" || Array.isArray(env) || !Object.values(env).every((value) => typeof value === "string")) {
    fail("env must be a string map");
  }
  if (!Array.isArray(files) || !files.every((file) => typeof file === "string" && file.length > 0)) fail("files must be a string list");
  const snapshot = Object.freeze({ ...env });
  const permittedFiles = new Set(files);
  return Object.freeze({
    env: async (name) => Object.hasOwn(snapshot, name) ? snapshot[name] : undefined,
    fileExists: async (file) => permittedFiles.has(file),
  });
}

/** Build an in-memory policy for a registry-issued profile; never writes a catalog. */
export function createAccountConfigPolicy({ profile, env = {} } = {}) {
  try { requireContext(profile); } catch { fail("profile must be a registry-issued profile"); }
  if (!env || typeof env !== "object" || Array.isArray(env) || !Object.values(env).every((value) => typeof value === "string")) {
    fail("env must be a string map");
  }
  const accountEnv = Object.freeze({ ...env });
  const referenceOwner = profile.id === "evolvera" && profile.adoption === "reference";
  const filterConfig = (providers) => {
    if (!providers || typeof providers !== "object" || Array.isArray(providers)) fail("providers must be an object");
    if (referenceOwner) return Object.fromEntries(Object.entries(providers).map(([id, config]) => [id, sanitizeReferenceAuth(config, accountEnv)]));
    return Object.fromEntries(Object.entries(providers).map(([id, config]) => [id, withoutAuthValues(config)]));
  };
  const filterRegistration = (registration) => referenceOwner ? sanitizeReferenceAuth(registration, accountEnv) : withoutAuthValues(registration);
  return Object.freeze({
    referenceOwner,
    env: accountEnv,
    filterConfig,
    filterRegistration,
  });
}

/** Prepare only the exact published ModelRuntime 1.0.1 source text. */
export function transformModelRuntimeSource(text) {
  let output = text;
  output = replaceOnce(output,
    "    constructor(credentials, config, modelsPath, modelsStore, providers, modelNetworkEnabled) {",
    "    constructor(credentials, config, modelsPath, modelsStore, providers, modelNetworkEnabled, authContext, accountConfigPolicy) {\n        this.authContext = authContext;\n        this.accountConfigPolicy = accountConfigPolicy;",
    "ModelRuntime constructor");
  output = replaceOnce(output,
    "        this.models = createModels({ credentials, modelsStore });",
    "        this.models = createModels({ credentials, modelsStore, authContext: this.authContext });",
    "createModels auth context");
  output = replaceOnce(output,
    "        const config = await ModelConfig.load(modelsPath);",
    "        const config = await ModelConfig.load(modelsPath, options.accountConfigPolicy?.filterConfig);",
    "initial ModelConfig policy");
  output = replaceOnce(output,
    "new ModelRuntime(credentials, config, modelsPath, modelsStore, providers, process.env.PI_OFFLINE === undefined);",
    "new ModelRuntime(credentials, config, modelsPath, modelsStore, providers, process.env.PI_OFFLINE === undefined, options.authContext, options.accountConfigPolicy);",
    "ModelRuntime factory propagation");
  output = replaceOnce(output,
    "        this.config = await ModelConfig.load(this.modelsPath);",
    "        this.config = await ModelConfig.load(this.modelsPath, this.accountConfigPolicy?.filterConfig);",
    "refresh ModelConfig policy");
  const registrationAnchor = `        validateExtensionProvider(providerId, this.builtins.get(providerId), this.config.getProvider(providerId), config);`;
  const registrationReplacement = `        config = this.accountConfigPolicy ? this.accountConfigPolicy.filterRegistration(config) : config;\n${registrationAnchor}`;
  output = replaceOnce(output, registrationAnchor, registrationReplacement, "extension registration policy");
  output = replaceOnce(output,
    "        const effective = { ...previous };",
    "        const effective = this.accountConfigPolicy ? this.accountConfigPolicy.filterRegistration(previous ?? {}) : { ...previous };",
    "registration merge policy");
  return output;
}

/** Prepare a post-schema, pre-freeze ModelConfig policy hook. */
export function transformModelConfigSource(text) {
  const anchor = `        const config = parsed;\n        const providers = new Map();`;
  const replacement = `        const config = parsed;\n        const policyProviders = typeof transform === "function" ? transform(config.providers) : config.providers;\n        const providers = new Map();`;
  let output = replaceOnce(text, anchor, replacement, "ModelConfig policy hook");
  output = replaceOnce(output,
    "    static async load(modelsJsonPath) {",
    "    static async load(modelsJsonPath, transform) {",
    "ModelConfig load options");
  output = replaceOnce(output,
    "        for (const [providerId, provider] of Object.entries(config.providers)) {",
    "        for (const [providerId, provider] of Object.entries(policyProviders)) {",
    "ModelConfig filtered providers");
  return output;
}
