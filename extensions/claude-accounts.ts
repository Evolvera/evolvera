import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Provider } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

const PRIMARY = "anthropic";
const OAUTH_BEARER = "Bearer sk-ant-oat";
const FULL = 0.98;
const SWITCH_MARGIN = 0.1;
const STATE_TTL_MS = 5_000;
const FALLBACK_LIMIT_MS = 5 * 60_000;

type Config = { accounts: number; drainWindowHours: number };
type Usage = {
  status?: string;
  u5h?: number;
  r5h?: number;
  u7d?: number;
  r7d?: number;
  limitedUntil?: number;
  at: number;
};
type State = Record<string, Usage>;

const configPath = join(getAgentDir(), "claude-accounts.json");
const statePath = join(getAgentDir(), "claude-accounts-state.json");
const oauthShapingDir = join(getAgentDir(), "npm/node_modules/@gotgenes/pi-anthropic-auth/src");

export function accountIds(count: number): string[] {
  return Array.from({ length: Math.max(1, count) }, (_, i) => (i === 0 ? PRIMARY : `${PRIMARY}-${i + 1}`));
}

function readJson<T>(path: string, fallback: T): T {
  try {
    return { ...fallback, ...JSON.parse(readFileSync(path, "utf8")) };
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, path);
}

function readConfig(): Config {
  return readJson<Config>(configPath, { accounts: 1, drainWindowHours: 48 });
}

let stateCache: { state: State; at: number } | undefined;

function readState(): State {
  const now = Date.now();
  if (stateCache && now - stateCache.at < STATE_TTL_MS) return stateCache.state;
  const state = existsSync(statePath) ? readJson<State>(statePath, {}) : {};
  stateCache = { state, at: now };
  return state;
}

function recordUsage(account: string, usage: Usage): void {
  const state = { ...readJson<State>(statePath, {}), [account]: usage };
  writeJsonAtomic(statePath, state);
  stateCache = { state, at: Date.now() };
}

function num(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function usageFromResponse(status: number, headers: Headers, now = Date.now()): Usage {
  const h = (name: string) => headers.get(`anthropic-ratelimit-unified-${name}`);
  const seconds = (value: number | undefined) => (value === undefined ? undefined : value * 1000);
  const usage: Usage = {
    status: h("status") ?? undefined,
    u5h: num(h("5h-utilization")),
    r5h: seconds(num(h("5h-reset"))),
    u7d: num(h("7d-utilization")),
    r7d: seconds(num(h("7d-reset"))),
    at: now,
  };
  if (status === 429 || usage.status === "rejected") {
    const retryAfter = num(headers.get("retry-after"));
    usage.limitedUntil =
      seconds(num(h("reset"))) ?? (retryAfter === undefined ? undefined : now + retryAfter * 1000) ?? now + FALLBACK_LIMIT_MS;
  }
  return usage;
}

function current(usage: Usage | undefined, now: number) {
  const u5h = usage?.r5h !== undefined && usage.r5h <= now ? 0 : (usage?.u5h ?? 0);
  const u7d = usage?.r7d !== undefined && usage.r7d <= now ? 0 : (usage?.u7d ?? 0);
  const limited = usage?.limitedUntil !== undefined && usage.limitedUntil > now;
  return { u5h, u7d, limited, r7d: usage?.r7d };
}

export function chooseAccount(
  candidates: string[],
  state: State,
  options: { sticky?: string; drainWindowMs: number; now?: number },
): string | undefined {
  const now = options.now ?? Date.now();
  const view = candidates.map((id) => ({ id, ...current(state[id], now) }));
  const usable = view.filter((a) => !a.limited && a.u5h < FULL && a.u7d < FULL);
  if (usable.length === 0) {
    return [...view].sort((a, b) => (state[a.id]?.limitedUntil ?? 0) - (state[b.id]?.limitedUntil ?? 0))[0]?.id;
  }
  const draining = usable
    .filter((a) => a.r7d !== undefined && a.r7d > now && a.r7d - now <= options.drainWindowMs)
    .sort((a, b) => a.r7d! - b.r7d!);
  if (draining.length > 0) return draining[0].id;
  const best = [...usable].sort((a, b) => a.u7d - b.u7d || a.u5h - b.u5h)[0];
  const sticky = usable.find((a) => a.id === options.sticky);
  return sticky && sticky.u7d - best.u7d <= SWITCH_MARGIN ? sticky.id : best.id;
}

function authProvider(base: Provider, id: string, index: number): Provider {
  return {
    id,
    name: `Claude (conta ${index})`,
    baseUrl: base.baseUrl,
    headers: base.headers,
    auth: { oauth: base.auth.oauth },
    getModels: () => [],
    stream: base.stream.bind(base),
    streamSimple: base.streamSimple.bind(base),
  };
}

export default async function (pi: ExtensionAPI): Promise<void> {
  const { builtinProviders } = await import("@earendil-works/pi-ai/providers/all");
  const base = builtinProviders().find((provider: Provider) => provider.id === PRIMARY);
  if (!base?.auth.oauth) throw new Error("claude-accounts: built-in Anthropic OAuth provider not found");
  const { resolveBuiltinAnthropicStreamSimple } = await import(join(oauthShapingDir, "host-transport.ts"));
  const { createAnthropicOAuthStreamSimple } = await import(join(oauthShapingDir, "oauth-transport.ts"));
  const shaped = createAnthropicOAuthStreamSimple(await resolveBuiltinAnthropicStreamSimple());
  let registry: ModelRegistry | undefined;
  let sticky: string | undefined;
  const registered = new Set<string>();

  const registerAccounts = (count: number) => {
    accountIds(count).forEach((id, i) => {
      if (id === PRIMARY || registered.has(id)) return;
      pi.registerProvider(authProvider(base, id, i + 1));
      registered.add(id);
    });
  };

  const configuredAccounts = (): string[] =>
    accountIds(readConfig().accounts).filter(
      (id) => id === PRIMARY || registry?.getProviderAuthStatus(id).configured === true,
    );

  const tokenFor = async (id: string, primaryAuth: string): Promise<string | undefined> => {
    if (id === PRIMARY) return primaryAuth;
    const key = await registry?.getApiKeyForProvider(id);
    return key ? `Bearer ${key}` : undefined;
  };

  const routedFetch =
    (inner: typeof fetch): typeof fetch =>
    async (input, init) => {
      const headers = new Headers(init?.headers);
      const primaryAuth = headers.get("authorization");
      if (!primaryAuth?.startsWith(OAUTH_BEARER)) return inner(input, init);
      const candidates = configuredAccounts();
      const drainWindowMs = readConfig().drainWindowHours * 3_600_000;
      const tried = new Set<string>();
      let response: Response | undefined;
      for (;;) {
        const remaining = candidates.filter((id) => !tried.has(id));
        const account = chooseAccount(remaining, readState(), { sticky, drainWindowMs });
        if (!account) break;
        tried.add(account);
        const auth = await tokenFor(account, primaryAuth);
        if (!auth) continue;
        headers.set("authorization", auth);
        response = await inner(input, { ...init, headers });
        recordUsage(account, usageFromResponse(response.status, response.headers));
        sticky = account;
        if (response.status !== 429 || tried.size >= candidates.length) return response;
        await response.body?.cancel();
      }
      return response ?? inner(input, init);
    };

  pi.unregisterProvider(PRIMARY);
  pi.registerProvider(PRIMARY, {
    api: "anthropic-messages",
    streamSimple: (model, context, options) =>
      shaped(model, context, { ...options, fetch: routedFetch(options?.fetch ?? globalThis.fetch) }),
  });
  registerAccounts(readConfig().accounts);

  pi.on("session_start", (_event, ctx) => {
    registry = ctx.modelRegistry;
  });

  pi.registerCommand("claude-accounts", {
    description: "Contas Claude em rodízio: status, ou `add` para incluir mais uma",
    handler: async (args, ctx) => {
      registry = ctx.modelRegistry;
      const config = readConfig();
      if (args.trim() === "add") {
        const next = { ...config, accounts: config.accounts + 1 };
        writeJsonAtomic(configPath, next);
        registerAccounts(next.accounts);
        ctx.ui.notify(
          `Conta ${next.accounts} criada. Rode /login e escolha "Claude (conta ${next.accounts})" para entrar com a outra assinatura.`,
          "info",
        );
        return;
      }
      const now = Date.now();
      const pct = (v?: number) => (v === undefined ? "?" : `${Math.round(v * 100)}%`);
      const when = (t?: number) => (t === undefined ? "?" : new Date(t).toLocaleString("pt-BR"));
      const state = readState();
      const lines = accountIds(config.accounts).map((id, i) => {
        const u = state[id];
        const c = current(u, now);
        const login = id === PRIMARY || registry?.getProviderAuthStatus(id).configured ? "" : " [sem login]";
        const limited = c.limited ? ` LIMITADA até ${when(u?.limitedUntil)}` : "";
        return `conta ${i + 1} (${id})${login}: 5h ${pct(c.u5h)} · semana ${pct(c.u7d)} (renova ${when(u?.r7d)})${limited}${id === sticky ? " ← em uso" : ""}`;
      });
      const next = chooseAccount(configuredAccounts(), state, {
        sticky,
        drainWindowMs: config.drainWindowHours * 3_600_000,
      });
      ctx.ui.notify(`${lines.join("\n")}\npróxima requisição: ${next ?? "nenhuma"}`, "info");
    },
  });
}
