import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// STATEFUL RESOURCE PROOF: NO_STATEFUL_RESOURCES. Static prompt-contract regression only.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (relativePath) => readFile(resolve(root, relativePath), "utf8");

const [system, systemMirror, planner, plannerSkill, planHeavy, builderSkill] = await Promise.all([
  read("SYSTEM.md"),
  read("config/SYSTEM.md"),
  read("agents/planner.md"),
  read("skills/planner/SKILL.md"),
  read("skills/plan-heavy/SKILL.md"),
  read("skills/builder/SKILL.md"),
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

assert.match(system, /triggers a decomposition audit, never an automatic split or parallel authorization/i);
assert.match(system, /Atomic checkpoint does not imply single builder/i);
assert.match(system, /Full write-set, validation-resource, stateful-resource, recovery, and external-effect isolation remain mandatory/i);

assert.match(planner, /## Wide-Task Parallelization Gate/);
assert.match(planner, /threshold triggers a decomposition audit only: it is not a file cap, automatic split/i);
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

console.log("wide-task parallelization smoke: PASS");
