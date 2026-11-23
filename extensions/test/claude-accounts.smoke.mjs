import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

// STATEFUL RESOURCE PROOF: NO_STATEFUL_RESOURCES. Pure in-memory checks; the extension factory never runs.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sdkRoot = resolvePiSdkRoot(import.meta.url);
const require = createRequire(import.meta.url);
const { createJiti } = require(path.join(sdkRoot, "node_modules/jiti/lib/jiti.cjs"));
const jiti = createJiti(import.meta.url, { fsCache: false, alias: { "@earendil-works/pi-coding-agent": path.join(sdkRoot, "dist/index.js") } });
const m = await jiti.import(path.join(root, "extensions/claude-accounts.ts"));

const now = 1_000_000_000_000;
const hour = 3_600_000;
const drainWindowMs = 48 * hour;
const pick = (state, sticky) => m.chooseAccount(["anthropic", "anthropic-2", "anthropic-3"], state, { sticky, drainWindowMs, now });

assert.deepEqual(m.accountIds(3), ["anthropic", "anthropic-2", "anthropic-3"]);

assert.equal(pick({ anthropic: { u7d: 0.7, at: now }, "anthropic-2": { u7d: 0.2, at: now }, "anthropic-3": { u7d: 0.5, at: now } }), "anthropic-2");

assert.equal(
  pick({ anthropic: { u7d: 0.9, r7d: now + 30 * hour, at: now }, "anthropic-2": { u7d: 0.1, r7d: now + 100 * hour, at: now }, "anthropic-3": { u7d: 0.2, r7d: now + 40 * hour, at: now } }),
  "anthropic",
  "drains the account whose weekly window renews soonest",
);

assert.equal(
  pick({ anthropic: { u7d: 0.99, r7d: now + 10 * hour, at: now }, "anthropic-2": { u7d: 0.3, at: now }, "anthropic-3": { u7d: 0.4, at: now } }),
  "anthropic-2",
  "a full account is not drained",
);

assert.equal(
  pick({ anthropic: { u7d: 0.1, limitedUntil: now + hour, at: now }, "anthropic-2": { u7d: 0.6, at: now }, "anthropic-3": { u7d: 0.5, at: now } }),
  "anthropic-3",
  "a rate-limited account is skipped until its reset",
);

assert.equal(
  pick({ anthropic: { u7d: 0.35, at: now }, "anthropic-2": { u7d: 0.3, at: now }, "anthropic-3": { u7d: 0.5, at: now } }, "anthropic"),
  "anthropic",
  "stays on the current account within the switch margin",
);

assert.equal(
  pick({ anthropic: { u7d: 0.99, r7d: now - hour, at: now }, "anthropic-2": { u7d: 0.5, at: now }, "anthropic-3": { u7d: 0.5, at: now } }),
  "anthropic",
  "usage resets once its window has passed",
);

const limited = m.usageFromResponse(429, new Headers({
  "anthropic-ratelimit-unified-status": "rejected",
  "anthropic-ratelimit-unified-7d-utilization": "1.0",
  "anthropic-ratelimit-unified-7d-reset": "1000000360",
  "anthropic-ratelimit-unified-reset": "1000000360",
}), now);
assert.deepEqual(limited, { status: "rejected", u5h: undefined, r5h: undefined, u7d: 1, r7d: 1_000_000_360_000, limitedUntil: 1_000_000_360_000, at: now });

console.log("claude-accounts smoke: ok");
