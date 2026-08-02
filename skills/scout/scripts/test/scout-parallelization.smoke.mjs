import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// STATEFUL RESOURCE PROOF: NO_STATEFUL_RESOURCES. Static prompt-contract regression only.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (relativePath) => readFile(resolve(root, relativePath), "utf8");

const [
  system,
  systemMirror,
  agentGuide,
  scoutSkill,
  scoutAgent,
  plannerSkill,
  plannerAgent,
  planHeavy,
  subagentsConfig,
] = await Promise.all([
  read("SYSTEM.md"),
  read("config/SYSTEM.md"),
  read("skills/agent-guide/SKILL.md"),
  read("skills/scout/SKILL.md"),
  read("agents/scout.md"),
  read("skills/planner/SKILL.md"),
  read("agents/planner.md"),
  read("skills/plan-heavy/SKILL.md"),
  read("subagents.json"),
]);

assert.equal(system, systemMirror, "SYSTEM mirrors must remain byte-identical");
const { maxConcurrent } = JSON.parse(subagentsConfig);
assert.ok(
  Number.isInteger(maxConcurrent) && maxConcurrent >= 4,
  "runtime concurrency must support the normal 2–4 scout wave",
);

for (const [name, text] of [
  ["SYSTEM", system],
  ["agent guide", agentGuide],
  ["scout skill", scoutSkill],
  ["planner skill", plannerSkill],
  ["plan-heavy skill", planHeavy],
]) {
  assert.match(text, /Scout Fan-out Map/i, `${name}: missing fan-out map contract`);
}

assert.match(system, /two or more independent evidence questions/i);
assert.match(system, /launch the 2–4 ready micro-scouts in one concurrent wave/i);
assert.match(system, /never a task, write-set proof, or parallel authorization/i);
assert.match(system, /generic test-only lanes do not justify a shard/i);

assert.match(agentGuide, /\*\*Scout fan-out rule:\*\*/);
assert.match(agentGuide, /Launch the 2–4 ready shards together in one message/i);
assert.match(agentGuide, /A shard is evidence routing, not a task, write-set proof, or parallel authorization/i);
assert.match(agentGuide, /use a synthesis scout only if direct reconciliation cannot resolve them/i);
assert.doesNotMatch(agentGuide, /Prefer many small parallel scouts over one big scout/i);

assert.match(scoutSkill, /## Scout Fan-out Gate/);
assert.match(scoutSkill, /Launch every map-admitted ready shard together in one message/i);
assert.match(scoutSkill, /Use normally 2–4 scouts; go beyond four only when/i);
assert.match(scoutSkill, /runtime `maxConcurrent` setting is a ceiling, never a target/i);
assert.match(scoutSkill, /focused tests travel with the production concern they verify/i);
assert.match(scoutSkill, /A scout shard accelerates evidence retrieval; it never proves a task boundary, write-set isolation, valid checkpoint, or builder parallelism/i);
assert.doesNotMatch(scoutSkill, /Launch an additional scout only when a result exposes a required missing dependency/i);

assert.match(scoutAgent, /## Parallel Fan-out Shard \(conditional\)/);
assert.match(scoutAgent, /SCOUT FAN-OUT SHARD/);
assert.match(scoutAgent, /### Parallel Handoff/);
assert.match(scoutAgent, /not a task recommendation, write-set assignment, checkpoint claim, or parallel authorization/i);

assert.match(plannerSkill, /Scout Fan-out Map and Seam Synthesis/);
assert.match(plannerSkill, /include the Scout Fan-out Map and Seam Synthesis when multiple scouts ran/i);
assert.match(plannerSkill, /A shard's source scope speeds evidence retrieval but never proves a builder write set, checkpoint, or parallel lane/i);
assert.match(plannerSkill, /fan-out itself is not split proof/i);
assert.match(plannerAgent, /## Parallel Scout Evidence/);
assert.match(plannerAgent, /does not establish task ownership, disjoint write sets, a valid checkpoint, or parallel authorization/i);
assert.match(plannerAgent, /scout fan-out is never decomposition proof/i);
assert.match(planHeavy, /Reconcile the resulting Seam Synthesis before the briefers/i);
assert.match(planHeavy, /include the Scout Fan-out Map and Seam Synthesis when multiple scouts ran/i);

// Regression shape: independent reconnaissance is parallelized; one shared causal state stays coherent.
const shouldFanOut = ({ independentQuestions, requiresCoherentState }) =>
  independentQuestions >= 2 && !requiresCoherentState;
assert.equal(
  shouldFanOut({
    independentQuestions: 3,
    requiresCoherentState: false,
  }),
  true,
  "independent entry/contract/runner questions must admit a parallel scout wave",
);
assert.equal(
  shouldFanOut({ independentQuestions: 3, requiresCoherentState: true }), false);
assert.equal(shouldFanOut({ independentQuestions: 1, requiresCoherentState: false }), false);

console.log("scout parallelization smoke: PASS");
