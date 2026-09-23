export const ROLE_NAMES = ["observer", "reflector", "compactor", "project-promoter"] as const;
const CURRENT_ROLE_MODEL = "openai-codex/gpt-6-luna" as const;
const PREVIOUS_ROLE_MODEL = "openai-codex/gpt-5.6-luna" as const;
function supportedRoleModel(value: unknown): boolean {
  return value === CURRENT_ROLE_MODEL || value === PREVIOUS_ROLE_MODEL;
}
export type PlasticMemoryRole = (typeof ROLE_NAMES)[number];

export type RoleConfig = {
  model: "openai-codex/gpt-6-luna";
  thinking: "medium";
  maxTurns: 8;
  maxToolCalls: 4;
  maxRuntimeMs: 60_000;
};

export type PlasticMemoryConfig = {
  enabled: boolean;
  roles: Record<PlasticMemoryRole, RoleConfig>;
  edgeTriggers: { observeAfterTokens: 10_000; reflectAfterTokens: 20_000 };
  pool: { maxTokens: 20_000; targetTokens: 10_000 };
  automaticRetryCount: 1;
  pendingTtlMs: 300_000;
  summaryCapChars: 48_000;
  projectCaps: { summaryChars: 8_000; indexChars: 4_000; categoryChars: 4_000 };
};

function role(): RoleConfig {
  return {
    model: "openai-codex/gpt-6-luna",
    thinking: "medium",
    maxTurns: 8,
    maxToolCalls: 4,
    maxRuntimeMs: 60_000,
  };
}

function defaults(enabled = false): PlasticMemoryConfig {
  return {
    enabled,
    roles: {
      observer: role(),
      reflector: role(),
      compactor: role(),
      "project-promoter": role(),
    },
    edgeTriggers: { observeAfterTokens: 10_000, reflectAfterTokens: 20_000 },
    pool: { maxTokens: 20_000, targetTokens: 10_000 },
    automaticRetryCount: 1,
    pendingTtlMs: 300_000,
    summaryCapChars: 48_000,
    projectCaps: { summaryChars: 8_000, indexChars: 4_000, categoryChars: 4_000 },
  };
}

export const DEFAULT_CONFIG: PlasticMemoryConfig = Object.freeze(defaults(false));

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key)) && keys.every((key) => key in value);
}

function validRole(value: unknown): value is RoleConfig {
  return isRecord(value) && exactKeys(value, ["model", "thinking", "maxTurns", "maxToolCalls", "maxRuntimeMs"])
    && supportedRoleModel(value.model) && value.thinking === "medium"
    && value.maxTurns === 8 && value.maxToolCalls === 4 && value.maxRuntimeMs === 60_000;
}

function validConfig(value: Record<string, unknown>): boolean {
  if (typeof value.enabled !== "boolean") return false;
  if (!isRecord(value.roles) || !exactKeys(value.roles, ROLE_NAMES) || !ROLE_NAMES.every((name) => validRole(value.roles?.[name]))) return false;
  if (!isRecord(value.edgeTriggers) || !exactKeys(value.edgeTriggers, ["observeAfterTokens", "reflectAfterTokens"]) || value.edgeTriggers.observeAfterTokens !== 10_000 || value.edgeTriggers.reflectAfterTokens !== 20_000) return false;
  if (!isRecord(value.pool) || !exactKeys(value.pool, ["maxTokens", "targetTokens"]) || value.pool.maxTokens !== 20_000 || value.pool.targetTokens !== 10_000) return false;
  if (value.automaticRetryCount !== 1 || value.pendingTtlMs !== 300_000 || value.summaryCapChars !== 48_000) return false;
  if (!isRecord(value.projectCaps) || !exactKeys(value.projectCaps, ["summaryChars", "indexChars", "categoryChars"]) || value.projectCaps.summaryChars !== 8_000 || value.projectCaps.indexChars !== 4_000 || value.projectCaps.categoryChars !== 4_000) return false;
  return true;
}

export function defaultConfig(): PlasticMemoryConfig {
  return defaults(false);
}

export function loadConfig(value?: unknown): PlasticMemoryConfig {
  if (value === undefined) return defaults(false);
  if (!isRecord(value)) return defaults(false);
  if (Object.keys(value).length === 1 && value.enabled === true) return defaults(true);
  if (!validConfig(value)) return defaults(false);
  // Existing explicit role settings remain enabled; only their resolved
  // in-memory model changes. Never write to the user's settings files.
  const resolved = structuredClone(value) as PlasticMemoryConfig;
  for (const name of ROLE_NAMES) {
    if ((resolved.roles[name].model as string) === PREVIOUS_ROLE_MODEL) {
      resolved.roles[name].model = CURRENT_ROLE_MODEL;
    }
  }
  return resolved;
}

export function isEnabled(config: PlasticMemoryConfig): boolean {
  return config.enabled === true;
}

export type ObservationalMemoryPackageConfiguration = {
  global: boolean;
  project: boolean;
  any: boolean;
};

export type ResolvedPlasticMemorySettings = {
  config: PlasticMemoryConfig;
  observationalMemoryConfigured: ObservationalMemoryPackageConfiguration;
};

const PLASTIC_MEMORY_NAMESPACE = "plastic-memory";
const OBSERVATIONAL_MEMORY_PACKAGE = /^npm:pi-observational-memory(?:@[^/\s]+)?$/;

/** Match only the exact npm package name, optionally followed by a version/tag. */
export function isObservationalMemoryPackageSpec(value: unknown): value is string {
  return typeof value === "string" && OBSERVATIONAL_MEMORY_PACKAGE.test(value);
}

export function hasObservationalMemoryPackage(packages: unknown): boolean {
  return Array.isArray(packages) && packages.some(isObservationalMemoryPackageSpec);
}

function mergeSettings(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = structuredClone(base);
  for (const [key, value] of Object.entries(override)) {
    if (isRecord(value) && isRecord(result[key])) {
      result[key] = mergeSettings(result[key], value);
    } else {
      result[key] = structuredClone(value);
    }
  }
  return result;
}

function validRoleFragment(value: unknown): boolean {
  if (!isRecord(value) || !Object.keys(value).every((key) => ["model", "thinking", "maxTurns", "maxToolCalls", "maxRuntimeMs"].includes(key))) return false;
  return Object.entries(value).every(([key, entry]) => {
    if (key === "model") return supportedRoleModel(entry);
    if (key === "thinking") return entry === "medium";
    if (key === "maxTurns") return entry === 8;
    if (key === "maxToolCalls") return entry === 4;
    return entry === 60_000;
  });
}

function validConfigFragment(value: Record<string, unknown>): boolean {
  const keys = ["enabled", "roles", "edgeTriggers", "pool", "automaticRetryCount", "pendingTtlMs", "summaryCapChars", "projectCaps"];
  if (!Object.keys(value).every((key) => keys.includes(key))) return false;
  if ("enabled" in value && typeof value.enabled !== "boolean") return false;
  if ("roles" in value) {
    if (!isRecord(value.roles) || !Object.keys(value.roles).every((key) => ROLE_NAMES.includes(key as PlasticMemoryRole)) || !Object.values(value.roles).every(validRoleFragment)) return false;
  }
  const nestedExactValues: Record<string, Record<string, unknown>> = {
    edgeTriggers: { observeAfterTokens: 10_000, reflectAfterTokens: 20_000 },
    pool: { maxTokens: 20_000, targetTokens: 10_000 },
    projectCaps: { summaryChars: 8_000, indexChars: 4_000, categoryChars: 4_000 },
  };
  for (const [key, expected] of Object.entries(nestedExactValues)) {
    if (key in value) {
      const nested = value[key];
      if (!isRecord(nested) || !Object.keys(nested).every((field) => field in expected) || !Object.entries(nested).every(([field, entry]) => entry === expected[field])) return false;
    }
  }
  if ("automaticRetryCount" in value && value.automaticRetryCount !== 1) return false;
  if ("pendingTtlMs" in value && value.pendingTtlMs !== 300_000) return false;
  if ("summaryCapChars" in value && value.summaryCapChars !== 48_000) return false;
  return true;
}

function readNamespace(settings: unknown): { valid: true; value: Record<string, unknown> } | { valid: false } {
  if (settings === undefined) return { valid: true, value: {} };
  if (!isRecord(settings)) return { valid: false };
  if (!Object.prototype.hasOwnProperty.call(settings, PLASTIC_MEMORY_NAMESPACE)) {
    return { valid: true, value: {} };
  }
  const namespace = settings[PLASTIC_MEMORY_NAMESPACE];
  return isRecord(namespace) && validConfigFragment(namespace) ? { valid: true, value: namespace } : { valid: false };
}

export function resolvePlasticMemorySettings(
  globalSettings?: unknown,
  projectSettings?: unknown,
): ResolvedPlasticMemorySettings {
  const observationalMemoryConfigured = { global: false, project: false, any: false };

  try {
    observationalMemoryConfigured.global = isRecord(globalSettings) && hasObservationalMemoryPackage(globalSettings.packages);
    observationalMemoryConfigured.project = isRecord(projectSettings) && hasObservationalMemoryPackage(projectSettings.packages);
    observationalMemoryConfigured.any = observationalMemoryConfigured.global || observationalMemoryConfigured.project;
    const globalNamespace = readNamespace(globalSettings);
    const projectNamespace = readNamespace(projectSettings);
    if (!globalNamespace.valid || !projectNamespace.valid) {
      return { config: defaults(false), observationalMemoryConfigured };
    }
    const merged = mergeSettings(defaults(false), globalNamespace.value);
    return {
      config: loadConfig(mergeSettings(merged, projectNamespace.value)),
      observationalMemoryConfigured,
    };
  } catch {
    return { config: defaults(false), observationalMemoryConfigured };
  }
}
