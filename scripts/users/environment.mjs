import path from "node:path";
import { defaultRegistryPath, requireContext } from "./registry.mjs";

const AMBIENT_DENY = /^(?:PI_USER_ID|PI_CODING_AGENT_(?:DIR|SESSION_DIR)|APP_CODING_AGENT_DIR|ANTHROPIC_|OPENAI_|AZURE_|AWS_|GOOGLE_|VERTEX_|BEDROCK_|CLOUDFLARE_|DASHSCOPE_|ALIBABA_|MISTRAL_|GROQ_|DEEPSEEK_|GEMINI_|XAI_|COHERE_|HF_|HUGGINGFACE_|MCP_|NODE_OPTIONS$|NODE_PATH$)|(?:_API_KEY|_TOKEN|_SECRET|_ACCESS_KEY)$/i;

export function getUserHome(profileContext) {
  const profile = requireContext(profileContext);
  if (path.basename(profile.agentDir).toLowerCase() !== "agent" || path.basename(path.dirname(profile.agentDir)).toLowerCase() !== ".pi") {
    throw Object.assign(new Error("USER_HOME_UNSUPPORTED_LAYOUT"), { code: "USER_HOME_UNSUPPORTED_LAYOUT" });
  }
  return path.dirname(path.dirname(profile.agentDir));
}

/** Build a new process environment from OS execution essentials and one issued profile. */
export function createUserEnvironment(profileContext, { baseEnv = process.env, sessionDir } = {}) {
  const profile = requireContext(profileContext);
  const env = Object.create(null);
  for (const key of ["SystemRoot", "windir", "PATH", "PATHEXT", "ComSpec", "SYSTEMDRIVE"]) {
    if (typeof baseEnv[key] === "string") env[key] = baseEnv[key];
  }
  const home = getUserHome(profile);
  const appData = path.join(home, "AppData", "Roaming");
  const localAppData = path.join(home, "AppData", "Local");
  const cache = path.join(localAppData, "Cache");
  Object.assign(env, {
    HOME: home,
    USERPROFILE: home,
    APPDATA: appData,
    LOCALAPPDATA: localAppData,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_CACHE_HOME: cache,
    TMP: path.join(localAppData, "Temp"),
    TEMP: path.join(localAppData, "Temp"),
    TMPDIR: path.join(localAppData, "Temp"),
    PI_CODING_AGENT_DIR: profile.agentDir,
    PI_CODING_AGENT_SESSION_DIR: sessionDir ?? profile.sessionRoots[0],
    PI_USER_ID: profile.id,
    PI_USERS_REGISTRY: profile.registryPath ?? defaultRegistryPath(home),
  });
  return Object.freeze(env);
}

/** Drop ambient user/provider credentials before importing the SDK or provider code. */
export function installUserEnvironment(profileContext, options = {}) {
  const env = createUserEnvironment(profileContext, options);
  for (const key of Object.keys(process.env)) {
    if (!Object.hasOwn(env, key)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(env)) process.env[key] = value;
  return env;
}

export function isAmbientCredentialVariable(name) {
  return typeof name === "string" && AMBIENT_DENY.test(name);
}

// Managed-launcher child context: account identity and its shared registry namespace only.
export const ACCOUNT_LAUNCH_CONTEXT_ENV = "PI_ACCOUNT_LAUNCH_CONTEXT";
const ACCOUNT_ID_RE = /^[a-z][a-z0-9-]{1,31}$/;
const ACCOUNT_CONTEXT_KEYS = ["accountId", "registryPath", "version"];
const contextFail = () => Object.assign(new Error("ACCOUNT_LAUNCH_CONTEXT_INVALID"), { code: "ACCOUNT_LAUNCH_CONTEXT_INVALID" });

function validateAccountLaunchContext(context) {
  if (!context || typeof context !== "object" || Array.isArray(context) ||
      Object.keys(context).sort().join(",") !== ACCOUNT_CONTEXT_KEYS.join(",") || context.version !== 1 ||
      typeof context.accountId !== "string" || !ACCOUNT_ID_RE.test(context.accountId) ||
      typeof context.registryPath !== "string" || !path.isAbsolute(context.registryPath) ||
      context.registryPath.includes("\0") || path.resolve(context.registryPath) !== context.registryPath) throw contextFail();
  return Object.freeze({ version: 1, accountId: context.accountId, registryPath: context.registryPath });
}

export function encodeAccountLaunchContext(context) {
  const valid = validateAccountLaunchContext(context);
  return Buffer.from(JSON.stringify(valid), "utf8").toString("base64url");
}

export function decodeAccountLaunchContext(encoded) {
  if (typeof encoded !== "string" || encoded.length === 0 || encoded.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw contextFail();
  try {
    const json = Buffer.from(encoded, "base64url").toString("utf8");
    if (Buffer.from(json, "utf8").toString("base64url") !== encoded) throw contextFail();
    const context = validateAccountLaunchContext(JSON.parse(json));
    if (JSON.stringify(context) !== json) throw contextFail();
    return context;
  } catch {
    throw contextFail();
  }
}

/** Strip only wrapper-owned context flags before native argv parsing; arguments after -- are literal. */
export function extractAccountLaunchContextArgs(argv) {
  if (!Array.isArray(argv) || argv.some((value) => typeof value !== "string")) throw contextFail();
  const nativeArgs = [];
  let encoded;
  let ended = false;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (ended) { nativeArgs.push(value); continue; }
    if (value === "--") { ended = true; nativeArgs.push(value); continue; }
    if (value === "--usuario-context" || value.startsWith("--usuario-context=")) {
      if (encoded !== undefined) throw contextFail();
      if (value === "--usuario-context") {
        encoded = argv[++index];
        if (typeof encoded !== "string" || encoded.length === 0 || encoded.startsWith("--")) throw contextFail();
      } else {
        encoded = value.slice("--usuario-context=".length);
        if (!encoded) throw contextFail();
      }
      continue;
    }
    nativeArgs.push(value);
  }
  return Object.freeze({ argv: Object.freeze(nativeArgs), encoded });
}
