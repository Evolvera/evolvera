import { createHash } from "node:crypto";

const PROVIDERS = Object.freeze({
  anthropic: Object.freeze({ url: "https://api.anthropic.com/api/oauth/usage", beta: "oauth-2025-04-20" }),
  "openai": Object.freeze({ url: "https://chatgpt.com/backend-api/wham/usage" }),
});
const CACHE_MS = 5 * 60 * 1000;
const REQUEST_MS = 5_000;
const fail = (reason) => Object.assign(new Error(reason), { reason });
const SAFE_REASONS = new Set(["invalid response", "invalid quota window", "invalid reset time", "provider request unavailable", "OAuth credential unavailable or expired", "account metadata unavailable"]);
const safeReason = (error) => SAFE_REASONS.has(error?.reason) ? error.reason : "OAuth credential or provider unavailable";
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const validPercent = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;

function resetIso(value, now) {
  const timestamp = typeof value === "number" && Number.isFinite(value) ? value * 1000 : Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp < now - 31_536_000_000 || timestamp > now + 31_536_000_000) throw fail("invalid reset time");
  return new Date(timestamp).toISOString();
}
function windowDto(usedPercent, durationSeconds, reset, now) {
  if (!validPercent(usedPercent) || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 31_536_000) throw fail("invalid quota window");
  return { durationSeconds, usedPercent, resetAt: resetIso(reset, now) };
}
function anthropicDto(payload, now) {
  if (!record(payload)) throw fail("invalid response");
  const windows = [];
  for (const [field, seconds] of [["five_hour", 18_000], ["seven_day", 604_800]]) {
    const item = payload[field];
    if (item === undefined || item === null) continue;
    if (!record(item) || !validPercent(item.utilization) || typeof item.resets_at !== "string") throw fail("invalid quota window");
    windows.push(windowDto(item.utilization, seconds, item.resets_at, now));
  }
  if (windows.length === 0) throw fail("invalid quota window");
  return windows;
}
function codexDto(payload, now) {
  const rate = payload?.rate_limit;
  if (!record(rate)) throw fail("invalid response");
  const windows = [];
  for (const key of ["primary_window", "secondary_window"]) {
    const item = rate[key];
    if (item === undefined || item === null) continue;
    if (!record(item) || !validPercent(item.used_percent) || !Number.isFinite(item.limit_window_seconds) || item.limit_window_seconds <= 0) throw fail("invalid quota window");
    let reset = item.reset_at;
    if (reset !== undefined && (typeof reset !== "number" || !Number.isFinite(reset))) throw fail("invalid quota window");
    if (reset === undefined) {
      if (!Number.isFinite(item.reset_after_seconds) || item.reset_after_seconds < 0) throw fail("invalid quota window");
      reset = now / 1000 + item.reset_after_seconds;
    }
    windows.push(windowDto(item.used_percent, item.limit_window_seconds, reset, now));
  }
  if (windows.length === 0) throw fail("invalid quota window");
  return { windows };
}
function accountHeader(credential) {
  if (credential.accountId !== undefined) return typeof credential.accountId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(credential.accountId) ? credential.accountId : undefined;
  const token = credential.access;
  if (typeof token !== "string") return undefined;
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || parts[1].length > 16_384) return undefined;
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    const id = claims?.["https://api.openai.com/auth"]?.chatgpt_account_id;
    return typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : undefined;
  } catch { return undefined; }
}

async function getJson(fetchImpl, provider, credential, now) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_MS);
  try {
    const headers = { authorization: `Bearer ${credential.access}`, accept: "application/json" };
    if (provider === "anthropic") {
      headers["anthropic-beta"] = PROVIDERS.anthropic.beta;
    } else {
      const id = accountHeader(credential);
      if (!id) throw fail("account metadata unavailable");
      headers["ChatGPT-Account-Id"] = id;
    }
    const response = await fetchImpl(PROVIDERS[provider].url, { method: "GET", headers, redirect: "error", signal: controller.signal });
    if (!response?.ok) throw fail("provider request unavailable");
    const text = await response.text();
    if (typeof text !== "string" || text.length > 256_000) throw fail("invalid response");
    let payload;
    try { payload = JSON.parse(text); } catch { throw fail("invalid response"); }
    if (provider === "anthropic") return { windows: anthropicDto(payload, now) };
    const result = codexDto(payload, now);
    const availableCount = payload?.rate_limit_reset_credits?.available_count;
    if (typeof availableCount === "number" && Number.isSafeInteger(availableCount) && availableCount >= 0) result.bankedResets = availableCount;
    return result;
  } catch (error) {
    if (error?.reason) throw error;
    throw fail("provider request unavailable");
  } finally { clearTimeout(timer); }
}

/** Create an in-memory quota collector bound to one explicitly supplied credential reader. */
export function createProviderQuotaCollector({ readCredential, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  if (typeof readCredential !== "function" || typeof fetchImpl !== "function" || typeof now !== "function") throw new TypeError("quota collector dependencies required");
  const cache = new Map();
  return async function readProviderQuotas() {
    const timestamp = now();
    const providers = await Promise.all(Object.keys(PROVIDERS).map(async (provider) => {
      try {
        const credential = await readCredential(provider, { signal: AbortSignal.timeout(REQUEST_MS) });
        if (!record(credential) || credential.type !== "oauth" || typeof credential.access !== "string" || credential.access.length === 0 || !Number.isFinite(credential.expires) || credential.expires <= timestamp) throw fail("OAuth credential unavailable or expired");
        const workspaceId = provider === "openai" ? accountHeader(credential) : "";
        if (provider === "openai" && !workspaceId) throw fail("account metadata unavailable");
        const fingerprint = createHash("sha256").update(JSON.stringify([provider, credential.access, workspaceId])).digest("hex");
        const previous = cache.get(provider);
        if (previous?.fingerprint === fingerprint && timestamp < previous.until) return { provider, windows: previous.windows, ...(previous.bankedResets === undefined ? {} : { bankedResets: previous.bankedResets }), fetchedAt: previous.fetchedAt };
        cache.delete(provider);
        const { windows, bankedResets } = await getJson(fetchImpl, provider, credential, timestamp);
        const fetchedAt = new Date(timestamp).toISOString();
        cache.set(provider, { fingerprint, until: timestamp + CACHE_MS, windows, ...(bankedResets === undefined ? {} : { bankedResets }), fetchedAt });
        return { provider, windows, ...(bankedResets === undefined ? {} : { bankedResets }), fetchedAt };
      } catch (error) {
        cache.delete(provider);
        return { provider, windows: [], unavailable: safeReason(error) };
      }
    }));
    const successfulTimes = providers.filter((provider) => !provider.unavailable).map((provider) => Date.parse(provider.fetchedAt));
    const fetchedAt = new Date(successfulTimes.length ? Math.min(...successfulTimes) : timestamp).toISOString();
    return structuredClone({ fetchedAt, providers });
  };
}
