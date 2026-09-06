import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// STATEFUL RESOURCE PROOF: NO_STATEFUL_RESOURCES. Static prompt-contract regression only.
// These assertions verify the written contract text and a local decision oracle; they are not a
// behavioral certification of the planner model, which requires a separate synthetic planner run.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (relativePath) => readFile(resolve(root, relativePath), "utf8");

const [system, systemMirror, planner, plannerSkill, planHeavy, builderSkill, agentGuide] = await Promise.all([
  read("SYSTEM.md"),
  read("config/SYSTEM.md"),
  read("agents/planner.md"),
  read("skills/planner/SKILL.md"),
  read("skills/plan-heavy/SKILL.md"),
  read("skills/builder/SKILL.md"),
  read("skills/agent-guide/SKILL.md"),
]);

assert.equal(system, systemMirror, "SYSTEM mirrors must remain byte-identical");

const trigger = /more than 20 (?:declared )?changed paths or (?:spans )?three or more (?:distinct )?semantic regions/i;
for (const [name, text] of [
  ["SYSTEM", system],
  ["planner agent", planner],
  ["planner skill", plannerSkill],
  ["plan-heavy skill", planHeavy],
  ["builder skill", builderSkill],
]) {
  assert.match(text, trigger, `${name}: missing wide-task trigger`);
  assert.match(text, /WIDE_TASK_DECOMPOSITION_UNPROVEN/, `${name}: missing fail-closed verdict`);
}

assert.match(system, /triggers a decomposition audit, never an automatic split, file cap, or parallel authorization/i);
assert.match(system, /breadth detector separate from the workload budget/i);
assert.match(system, /Atomic checkpoint does not imply single builder/i);
assert.match(system, /Full write-set, validation-resource, stateful-resource, recovery, and external-effect isolation remain mandatory/i);

assert.match(planner, /## Wide-Task Parallelization Gate/);
assert.match(planner, /threshold triggers a decomposition audit only: it is not a file cap, automatic split/i);
assert.match(planner, /breadth detector separate from the Builder Workload Budget/i);
assert.match(planner, /additive\/tolerant contracts/);
assert.match(planner, /consumer-first null-safe, optional-field, or dual-read readiness/);
assert.match(planner, /producer\/schema switch after consumers are ready/);
assert.match(planner, /largest safe ready wave, normally 2–4 tasks/);
assert.match(planner, /Tests belong to the production region they verify and never become a testing-only lane/);
assert.match(planner, /Generic claims such as "same compile boundary", "same typecheck", or "one checkpoint" are insufficient/);
assert.match(planner, /Wide-Task Receipt when triggered: path count, semantic regions, seams\/cuts attempted/);
assert.match(planner, /file count alone never activates it/i, "internal-order safety rule must remain intact");

assert.match(plannerSkill, /serial compatibility prerequisite followed by the largest safe ready wave, normally 2–4 tasks/i);
assert.match(plannerSkill, /Tests travel with their production slice/i);
assert.match(planHeavy, /Apply the planner's Wide-Task Parallelization Gate before accepting an atomic task or using internal phases/i);

assert.match(builderSkill, /never let one builder absorb an unproven wide scope/i);
assert.match(builderSkill, /launch that group concurrently in one orchestration message/i);
assert.match(builderSkill, /do not start one member and wait while another independent member is already ready/i);
assert.match(builderSkill, /full write sets, recovery\/build artifacts, validation resources, and external effects are disjoint/i);
assert.match(builderSkill, /databases, fixtures, caches, and external targets cannot interfere/i);

// Two-complex-front admission cap must exist on every active admission surface, with no heavy,
// receipt, or internal-phase waiver, and without becoming a file cap.
const frontCap = /(hard maximum (?:is )?two|at most two complex fronts|maximum two)/i;
for (const [name, text] of [
  ["SYSTEM", system],
  ["planner agent", planner],
  ["planner skill", plannerSkill],
  ["plan-heavy skill", planHeavy],
  ["builder skill", builderSkill],
  ["agent-guide skill", agentGuide],
]) {
  assert.match(text, frontCap, `${name}: missing two-complex-front ceiling`);
  assert.match(text, /BLOCKED: BUILDER_COMPLEXITY_LIMIT/, `${name}: missing fail-closed workload verdict`);
  assert.match(text, /builder-heavy-design/, `${name}: cap must cover the heavy tiers`);
  assert.match(
    text,
    /never waive|never waives|cannot be waived|never waive it|never waives it/i,
    `${name}: missing non-waiver rule for receipt/model/phases`,
  );
}

assert.match(planner, /## Builder Workload Budget/);
assert.match(planner, /Wide-Task Receipt, a stronger route, or `## Internal Execution Order` never waives the cap/i);
assert.match(planner, /Intra-task phases are considered only after the budget already passes/i);
assert.match(planner, /path count is not cognitive load/i);
assert.match(planner, /Workload receipt: complex front names and count/);
assert.match(planner, /fewest tasks that stay within the builder workload budget/i);
assert.match(plannerSkill, /choose the fewest tasks within that budget rather than the fewest tasks/i);
assert.match(plannerSkill, /an over-limit task is rejected before delegation/i);
assert.match(builderSkill, /## Workload Admission/);
assert.match(builderSkill, /A builder must not grow its scope into a new complex front/i);
assert.match(agentGuide, /\*\*Builder workload admission:\*\*/);
assert.match(agentGuide, /counts coherent commits\/tasks rather than complex fronts/i);
assert.match(
  system,
  /large homogeneous, mirrored, or mechanical batch may remain one task after proportional proof/i,
);

// Regression shape derived from the observed CRM plan: 53 changed paths across several semantic regions.
const isWide = ({ changedPaths, semanticRegions }) => changedPaths > 20 || semanticRegions.length >= 3;
assert.equal(
  isWide({
    changedPaths: 53,
    semanticRegions: ["shared-contract", "schema", "projection", "domain", "ingestion", "api", "ui"],
  }),
  true,
  "the observed 53-path task must trigger the decomposition audit",
);
assert.equal(isWide({ changedPaths: 12, semanticRegions: ["module", "focused-tests"] }), false);

// Deterministic workload oracle: mechanical followers of one settled contract never add fronts,
// two fronts pass only when tightly coupled, and three fronts never escalate to a heavy tier.
const workloadDisposition = ({ complexFronts, tightlyCoupled = false, separable = true }) => {
  if (complexFronts.length <= 1) return "ALLOW";
  if (complexFronts.length === 2) return tightlyCoupled ? "ALLOW" : "SPLIT";
  return separable ? "SPLIT" : "BLOCKED: BUILDER_COMPLEXITY_LIMIT";
};

assert.equal(
  workloadDisposition({
    complexFronts: ["queue-state-machine", "retry-policy", "serialization-format"],
    changedPaths: 3,
    separable: true,
  }),
  "SPLIT",
  "three complex fronts in one or few files must split, not stay atomic",
);
assert.equal(
  workloadDisposition({ complexFronts: ["schema-contract", "reader-migration"], tightlyCoupled: true }),
  "ALLOW",
  "two tightly coupled fronts in one coherent outcome remain allowable",
);
assert.equal(
  workloadDisposition({ complexFronts: ["selector-semantics"], mechanicalFollowers: ["mirrors", "tests", "docs"] }),
  "ALLOW",
  "mechanical mirrors/tests of the same settled contract are not extra fronts",
);
const homogeneousBatch = { changedPaths: 34, semanticRegions: ["mechanical-rename"], complexFronts: ["rename-contract"] };
assert.equal(isWide(homogeneousBatch), true, "a 34-path batch still triggers the breadth audit");
assert.equal(
  workloadDisposition(homogeneousBatch),
  "ALLOW",
  "width alone must not force a split for a homogeneous mechanical batch",
);
assert.equal(
  workloadDisposition({
    complexFronts: ["lifecycle-model", "scheduling-algorithm", "policy-composition"],
    separable: false,
  }),
  "BLOCKED: BUILDER_COMPLEXITY_LIMIT",
  "three inseparable complex fronts block instead of routing to a heavy tier",
);

console.log("wide-task parallelization smoke: PASS");
