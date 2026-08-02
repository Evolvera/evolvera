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
  codeAudit,
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
  read("skills/code-audit/SKILL.md"),
  read("subagents.json"),
]);

assert.equal(system, systemMirror, "SYSTEM mirrors must remain byte-identical");
const { maxConcurrent } = JSON.parse(subagentsConfig);
assert.equal(maxConcurrent, 12, "normal background subagent capacity must be exactly 12");

for (const [name, text] of [
  ["SYSTEM", system],
  ["agent guide", agentGuide],
  ["scout skill", scoutSkill],
  ["planner skill", plannerSkill],
  ["plan-heavy skill", planHeavy],
]) {
  assert.match(text, /Scout Fan-out Map/i, `${name}: missing fan-out map contract`);
  assert.doesNotMatch(text, /(?:launch|use normally|one)\s+(?:every ready\s+)?2[–-]4[^\n]{0,40}scout/i, `${name}: stale arbitrary scout-wave cap`);
}

assert.match(system, /inventory every product\/client\/runtime root in scope/i);
assert.match(system, /ADMIT \| DEFER \| MERGE \| SYNTHESIS/);
assert.match(system, /shard-breadth audit, not automatic splitting/i);
assert.match(system, /Launch every ready `ADMIT` shard up to free configured capacity/i);
assert.match(system, /never an arbitrary 2–4 cap/i);
assert.match(system, /a root excluded as inactive\/legacy needs evidence or remains `UNKNOWN`/i);
assert.match(system, /never a task, write-set proof, or parallel authorization/i);

assert.match(agentGuide, /\*\*Scout capacity and breadth rule:\*\*/);
assert.match(agentGuide, /configured background capacity, active agents, and free slots/i);
assert.match(agentGuide, /never impose an arbitrary 2–4 cap or leave a free slot/i);
assert.match(agentGuide, /A cross-root purpose\/behavior reconciliation is `SYNTHESIS`, not an initial shard/i);
assert.match(agentGuide, /largest `ADMIT` wave that fits free configured background capacity/i);
assert.doesNotMatch(agentGuide, /Prefer many small parallel scouts over one big scout/i);

assert.match(scoutSkill, /## Scout Fan-out Gate/);
assert.match(scoutSkill, /### Capacity and Shard-Breadth Gate/);
assert.match(scoutSkill, /`ADMIT` \(independent and ready now\), `DEFER`/);
assert.match(scoutSkill, /effective background `maxConcurrent` after any project override, currently active background agents, and free slots/i);
assert.match(scoutSkill, /Launch every ready `ADMIT` candidate up to free slots/i);
assert.match(scoutSkill, /do not impose an arbitrary 2–4 cap or leave a slot idle/i);
assert.match(scoutSkill, /A provisional candidate spanning three or more independent semantic regions triggers a \*\*Shard-Breadth Audit\*\*/);
assert.match(scoutSkill, /Generic labels such as “backend”, “frontend”, “full system”, or “all tests” are not coupling evidence/i);
assert.match(scoutSkill, /### Whole-System Reconnaissance/);
assert.match(scoutSkill, /A purpose or behavior reconciliation across those roots is normally `SYNTHESIS`/i);
assert.match(scoutSkill, /A scout shard accelerates evidence retrieval; it never proves a task boundary, write-set isolation, valid checkpoint, or builder parallelism/i);
assert.doesNotMatch(scoutSkill, /Use normally 2–4 scouts; go beyond four only when/i);

assert.match(scoutAgent, /## Parallel Fan-out Shard \(conditional\)/);
assert.match(scoutAgent, /SCOUT FAN-OUT SHARD/);
assert.match(scoutAgent, /### Parallel Handoff/);
assert.match(scoutAgent, /not a task recommendation, write-set assignment, checkpoint claim, or parallel authorization/i);

assert.match(plannerSkill, /configured background capacity, active agents, and free slots/i);
assert.match(plannerSkill, /ADMIT \| DEFER \| MERGE \| SYNTHESIS/);
assert.match(plannerSkill, /never an arbitrary 2–4 cap/i);
assert.match(plannerSkill, /Scout Fan-out Map and Seam Synthesis/);
assert.match(plannerSkill, /A shard's source scope speeds evidence retrieval but never proves a builder write set, checkpoint, or parallel lane/i);
assert.match(plannerSkill, /fan-out itself is not split proof/i);
assert.match(plannerAgent, /## Parallel Scout Evidence/);
assert.match(plannerAgent, /root inventory; structural trigger; configured\/active\/free background capacity/i);
assert.match(plannerAgent, /A candidate spanning three or more independent semantic regions must show its shard-breadth audit/i);
assert.match(plannerAgent, /does not establish task ownership, disjoint write sets, a valid checkpoint, or parallel authorization/i);
assert.match(plannerAgent, /scout fan-out is never decomposition proof/i);
assert.match(planHeavy, /launch every ready `ADMIT` scout up to free capacity/i);
assert.match(planHeavy, /never an arbitrary 2–4 cap/i);
assert.match(planHeavy, /reconcile the Seam Synthesis before the briefers/i);
assert.match(codeAudit, /currently caps concurrency at 12/i);
assert.match(codeAudit, /at most 12 simultaneous Agent calls and at most 9 waves/i);

// Regression shape: fill normal background capacity with independent evidence,
// defer broad/cross-root synthesis, and keep one coherent causal state together.
const freeSlots = ({ capacity, activeBackground }) => Math.max(0, capacity - activeBackground);
const admittedWaveSize = ({ admitted, capacity, activeBackground }) =>
  Math.min(admitted, freeSlots({ capacity, activeBackground }));
const needsBreadthAudit = (semanticRegions) => semanticRegions.length >= 3;

assert.equal(admittedWaveSize({ admitted: 12, capacity: 12, activeBackground: 0 }), 12);
assert.equal(admittedWaveSize({ admitted: 9, capacity: 12, activeBackground: 4 }), 8);
assert.equal(admittedWaveSize({ admitted: 3, capacity: 12, activeBackground: 0 }), 3);
assert.equal(needsBreadthAudit(["auth/routes", "data/schema", "realtime"]), true);
assert.equal(needsBreadthAudit(["module", "focused-tests"]), false);

console.log("scout parallelization smoke: PASS");
