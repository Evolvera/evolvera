import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const system = readFileSync(path.join(root, "config/SYSTEM.md"), "utf8");

function section(title, nextTitle) {
  const start = system.indexOf(`**${title}:**`);
  assert.notEqual(start, -1, `SYSTEM.md must contain the ${title} anchor`);
  const end = system.indexOf(`**${nextTitle}:**`, start + 1);
  return system.slice(start, end === -1 ? undefined : end);
}

const evidence = section("Evidence before questions", "Answer from the proven chain");
assert.match(evidence, /conversation|history/i, "look up the referenced conversation/history");
assert.match(evidence, /metadata/i, "use bounded history metadata");
assert.match(evidence, /identity/i, "verify the exact conversation identity");
assert.match(evidence, /secret|credential/i, "redact secrets from retrieved history");
assert.match(evidence, /authorization/i, "history must not count as fresh authorization");

const deliverable = section("Requested deliverable is the stop boundary", "Approval reuse");
assert.match(deliverable, /subtask|support task/i, "a support subtask cannot silently replace the outcome");
assert.match(deliverable, /credential/i, "credential checks are explicitly a support subtask");
assert.match(deliverable, /explicitly changes|explicit.*cancel/i, "parent outcome changes only by explicit user direction");
assert.match(deliverable, /prerequisite/i, "re-evaluate the requested outcome when prerequisites become valid");
assert.match(deliverable, /method.*target.*limit|target.*method.*limit/i, "revalidate actual method, target, and limits");
assert.match(deliverable, /revok|delet/i, "respect deletion and revocation");
assert.match(deliverable, /reuse.*credential|credential.*reuse/i, "do not reuse credentials beyond their check purpose");

const observability = section("Observability-first", "Post-build closure");
assert.match(observability, /simulat/i, "simulated transport or UI is not real journey evidence");
assert.match(observability, /mock/i, "mocks do not satisfy a requested real journey");
assert.match(observability, /canned response/i, "canned responses do not satisfy a requested real journey");
assert.match(observability, /model/i, "the explicitly requested target model must be used");
assert.match(observability, /benchmark/i, "a target-model benchmark must be run and evidenced");
assert.match(observability, /auth.*probe|probe.*auth/i, "auth-only probes cannot satisfy the requested journey");
assert.match(observability, /coverage/i, "coverage does not substitute for real target evidence");
assert.match(observability, /blocker/i, "otherwise report the exact genuine blocker");
assert.match(observability, /approval|authoriz/i, "preserve existing action-specific approval boundaries");
assert.match(observability, /budget|spend/i, "do not infer renewed budget or additional spend authority");
console.log("delivery-contract ok: history, deliverable, and real-journey guardrails");
