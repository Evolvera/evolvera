import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = "/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent";
const { createJiti } = await import(pathToFileURL(path.join(packageRoot, "node_modules/jiti/lib/jiti.mjs")).href);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const ids = await jiti.import(path.join(root, "plastic-memory/common/ids.ts"));
const safety = await jiti.import(path.join(root, "plastic-memory/common/safety.ts"));
const cycles = await jiti.import(path.join(root, "plastic-memory/session/cycles.ts"));
const runner = await jiti.import(path.join(root, "plastic-memory/workers/runner.ts"));
const observer = await jiti.import(path.join(root, "plastic-memory/workers/observer.ts"));

// A branchId whose UUID carries a digit-only run ("9012-3456") that the pre-fix phone pattern ate.
const BRANCH_ID = "branch:5dcfcddd-9012-3456-8a4e-eebabe925523";
const TIMESTAMP = "2026-08-05T04:53:13.984Z";
const EMAIL = "user@example.com";
const PHONE = "+55 11 91234-5678";
const binding = { sessionId: ids.sessionDigest("transport-integrity", { generation: 1 }), generation: 1, branchId: BRANCH_ID };

let next = 0;
const entries = [];
function message(role, tokenCount, text) {
  const entry = { type: "message", id: `e${++next}`, parentId: entries.at(-1)?.id ?? null, message: { role, content: [{ type: "text", text }] }, tokenCount };
  entries.push(entry);
  return entry;
}
const user = message("user", 40_000, "current goal: keep identity fields intact across worker transport");
const assistant = message("assistant", 40_000, "current terminal answer with no sensitive material");
const snapshot = cycles.createCompletedTurnSnapshot({ binding, sourceEntries: [user, assistant], activeEntryIds: [user.id, assistant.id], maxTokens: 100_000 });
assert.equal(snapshot.status, "ready");

const model = { provider: "openai-codex", id: "gpt-5.6-luna", contextWindow: 200_000, maxTokens: 16_000 };
const registry = {
  find: () => model,
  getProviderAuth: async () => ({ apiKey: "fake-only" }),
};
let observerPayload = "";
function runtimeReturning(respond) {
  return {
    modelRegistry: registry,
    async agentLoop(prompts) { return respond(JSON.parse(prompts[0].content[0].text)); },
  };
}

// 1. End-to-end through the real runObserver: semantic output carries citations only.
const observerRuntime = runtimeReturning((request) => {
  observerPayload = JSON.stringify({
    observations: [
      { content: "durable transport fact", timestamp: TIMESTAMP, relevance: "high", sourceEntryIds: request.sourceEntryIds },
      { content: `reach ${EMAIL} or ${PHONE} and rotate api_key: abc123def456`, timestamp: TIMESTAMP, relevance: "medium", sourceEntryIds: [request.sourceEntryIds[0]] },
    ],
  });
  return observerPayload;
});
const observed = await observer.runObserver({ binding, snapshot, sourceEntries: [user, assistant], runtime: observerRuntime });
assert.equal(observed.ok, true, `runObserver must close the cycle: ${observed.reason ?? ""}`);
assert.equal(observed.manifestValid, true);
assert.equal(observed.status, "complete");
assert.equal(observed.record.data.branchId, BRANCH_ID, "branchId survives transport untouched");
assert.equal(observed.record.data.span.sourceDigest, snapshot.span.sourceDigest);

// 2. ISO-8601 observation timestamps survive unmangled.
assert.equal(observed.observations[0].timestamp, TIMESTAMP);
assert.equal(observed.observations[1].timestamp, TIMESTAMP);

// 3. Content-level scrubbing still applies to the stored observation.
const stored = observed.observations[1].content;
assert.equal(stored.includes(EMAIL), false, "email must not be stored");
assert.equal(stored.includes("91234-5678"), false, "phone must not be stored");
assert.equal(stored.includes("abc123def456"), false, "secret must not be stored");
assert.ok(stored.includes("[REDACTED_PII]"), "PII marker present");
assert.ok(stored.includes("[REDACTED_SECRET]"), "secret marker present");

// Regression witness: the pre-fix runner scrubbed this exact payload before JSON.parse.
const preFixScrubbed = safety.scrubSensitiveText(observerPayload);
assert.throws(() => JSON.parse(preFixScrubbed), "pre-fix scrubbing destroys the JSON transport envelope");
const OLD_PHONE_PATTERN = /\b(?:\+?\d[\d ()-]{7,}\d)\b/gu;
assert.equal(BRANCH_ID.replace(OLD_PHONE_PATTERN, "[REDACTED_PII]").includes("9012-3456"), false, "the pre-fix phone pattern corrupted the branchId");
assert.equal("2026-08-05".replace(OLD_PHONE_PATTERN, "[REDACTED_PII]"), "[REDACTED_PII]", "the pre-fix phone pattern corrupted ISO dates");

// 4. Direct safety assertions: machine identifiers survive, real PII and secrets do not.
for (const survivor of [
  "2026-08-05",
  TIMESTAMP,
  BRANCH_ID,
  "5dcfcddd-9012-3456-8a4e-eebabe925523",
  binding.sessionId,
  snapshot.snapshotId,
  snapshot.cycleId,
  snapshot.span.sourceDigest,
  JSON.stringify({ ...binding, snapshotId: snapshot.snapshotId, ...snapshot.span }),
]) {
  assert.equal(safety.scrubSensitiveText(survivor), survivor, `must survive scrubbing: ${survivor}`);
  assert.equal(safety.hasSensitiveText(survivor), false, `must not be flagged sensitive: ${survivor}`);
}
for (const secret of ["+55 11 91234-5678", "(11) 91234-5678", "+1 (415) 555-2671", "11912345678", EMAIL, "api_key: abc123def456", "Authorization: Bearer sk-abcdef0123456789"]) {
  assert.equal(safety.hasSensitiveText(secret), true, `must be flagged sensitive: ${secret}`);
  const scrubbed = safety.scrubSensitiveText(`call ${secret} now`);
  assert.equal(scrubbed.includes(secret), false, `must be redacted: ${secret}`);
  assert.ok(/\[REDACTED_(?:PII|SECRET)\]/u.test(scrubbed), `must carry a redaction marker: ${secret}`);
}

// 5. The non-JSON fallback path is still scrubbed before it is returned as prose.
const proseRuntime = { modelRegistry: registry, agentLoop: async () => `contact ${EMAIL} for the summary` };
const prose = await runner.runBoundedRole({ role: "observer", prompt: "prose fallback", systemPrompt: "system", runtime: proseRuntime, inputTokens: 1 });
assert.equal(prose.ok, true);
assert.equal(typeof prose.response, "string");
assert.equal(prose.response.includes(EMAIL), false, "non-JSON fallback stays scrubbed");
assert.equal(prose.response, "contact [REDACTED_PII] for the summary");

// 6. Structured prompts are normalized without truncation and fail closed at the exact transport cap.
let oversizedCalls = 0;
const oversized = await runner.runBoundedRole({
  role: "observer",
  prompt: "x".repeat(600_001),
  runtime: { modelRegistry: registry, agentLoop: async () => { oversizedCalls += 1; return {}; } },
  inputTokens: 1,
});
assert.deepEqual(oversized, { ok: false, reason: "oversized", diagnostics: { role: "observer", message: "structured worker prompt exceeds transport cap" } });
assert.equal(oversizedCalls, 0, "oversized structured prompts must not call agentLoop");
let normalizedPrompt = "";
const fitting = await runner.runBoundedRole({
  role: "observer",
  prompt: "a".repeat(599_999) + "\u0000",
  runtime: { modelRegistry: registry, agentLoop: async (prompts) => { normalizedPrompt = prompts[0].content[0].text; return {}; } },
  inputTokens: 1,
});
assert.equal(fitting.ok, true);
assert.equal(normalizedPrompt, "a".repeat(599_999) + " ", "fitting prompt reaches runtime after control normalization only");
assert.equal(normalizedPrompt.length, 600_000);

console.log("PLASTIC_MEMORY_TRANSPORT_INTEGRITY: PASS (semantic transport, code-owned identities, ISO/UUID preservation, content scrubbing, prose fallback, and prompt cap integrity)");
