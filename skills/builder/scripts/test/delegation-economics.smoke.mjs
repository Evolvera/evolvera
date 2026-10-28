import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// STATEFUL RESOURCE PROOF: NO_STATEFUL_RESOURCES. Static prompt-contract regression only.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (path) => readFile(resolve(root, path), "utf8");
const paths = {
  system: "SYSTEM.md",
  mirror: "config/SYSTEM.md",
  guide: "skills/agent-guide/SKILL.md",
  builderSkill: "skills/builder/SKILL.md",
  scoutSkill: "skills/scout/SKILL.md",
  plannerSkill: "skills/planner/SKILL.md",
  scoutAgent: "agents/scout.md",
  builderAgent: "agents/builder.md",
  plannerAgent: "agents/planner.md",
};
const texts = Object.fromEntries(
  await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await read(path)])),
);

assert.equal(texts.system, texts.mirror, "SYSTEM mirrors must remain byte-identical");

for (const [name, text] of [
  ["SYSTEM", texts.system],
  ["agent guide", texts.guide],
  ["builder skill", texts.builderSkill],
  ["planner skill", texts.plannerSkill],
]) {
  assert.match(text, /(?:commit count|commits?)[^\n]{0,100}coordination hint[^\n]{0,100}(?:executor|cost proxy)/i, `${name}: missing economic routing rule`);
  assert.match(text, /expected (?:parent work replaced|work offloaded) exceeds handoff, integration, and (?:likely )?rework overhead/i, `${name}: delegation must replace parent work`);
  assert.doesNotMatch(text, /one goes direct/i, `${name}: stale one-commit routing heuristic`);
}

assert.match(texts.guide, /for optional execution\/retrieval delegation/i);
assert.match(texts.guide, /Do not add an agent while the parent performs the same task/i);
assert.doesNotMatch(texts.guide, /Only the orchestrator performs git commits and pushes/i);
assert.match(texts.guide, /decisive anchors plus actual diff\/evidence—not blanket re-investigation/i);
assert.match(texts.guide, /expected stable-ID universe derived independently from source\/config/i);
assert.match(texts.guide, /verified entry paths distinguished from search clues/i);
assert.match(texts.guide, /declare source read roots and the follow-import boundary/i);
assert.match(texts.guide, /Never derive the universe from the worker report/i);

for (const [name, text] of [
  ["SYSTEM", texts.system],
  ["builder skill", texts.builderSkill],
  ["planner skill", texts.plannerSkill],
  ["planner agent", texts.plannerAgent],
]) {
  assert.match(text, /observable contract is settled/i, `${name}: test authoring must require settled contract`);
  assert.match(text, /disjoint[^\n]{0,100}(?:write sets|full.*write)|(?:write sets|full.*write)[^\n]{0,100}disjoint/i, `${name}: test authoring must require disjoint writes`);
  assert.match(text, /resources are isolated|isolated validation resources/i, `${name}: test authoring must require isolated resources`);
  assert.match(text, /ready combined producer checkpoint/i, `${name}: implementation-dependent tests need the producer checkpoint`);
  assert.match(text, /syntax-only or blocked tests (?:are not acceptance|(?:never|do not) establish (?:acceptance|COMPLETE))/i, `${name}: syntax-only/blocked tests cannot establish acceptance`);
}
assert.match(texts.system, /when you change code or tracked files, commit each coherent, verified unit when done/i);
assert.match(texts.system, /it owns engineering, validation, and publication/i);
assert.match(texts.system, /launch all safe, ready evidence and authoring together in the same turn/i);
assert.match(texts.plannerSkill, /launch all safe, ready authoring/i);
assert.match(texts.builderSkill, /All safe, ready authoring is launched together, not just scouting/i);
assert.match(texts.builderSkill, /shared writable type\/API file, unsettled contract transition/i);
assert.match(texts.builderSkill, /read-only consumer of an unchanged settled interface does not by itself force serial work/i);
assert.match(texts.plannerAgent, /never (?:create|manufacture) an independently invalid test-only planner task or weaken checkpoint validity/i);
assert.match(texts.plannerAgent, /independently committable|checkpoint validity|without later restoration/i);

for (const [name, text] of [
  ["scout skill", texts.scoutSkill],
  ["scout agent", texts.scoutAgent],
]) {
  assert.match(text, /Finite Inventory Receipt \(conditional\)/, `${name}: finite-only receipt missing`);
  assert.match(text, /"status":"COMPLETE","items":\[\{"id":"stable-id","classification":"mission-specific value","evidence":\["path:line or command\/citation"\],"gap":null\}\]/, `${name}: receipt shape drift`);
  assert.match(text, /`?UNKNOWN`? requires (?:a )?nonblank gap/i, `${name}: unknown items need reasons`);
  assert.match(text, /do not write files or execute the checker|never write files or execute the checker/i, `${name}: scout must stay read-only`);
  assert.match(text, /node <absolute-scout-skill-dir>\/scripts\/check-inventory\.mjs <expected\.json> <receipt\.json>/, `${name}: checker handoff reference missing`);
  assert.match(text, /global versus project-local skill resolution determines which directory applies/i, `${name}: checker path must follow loaded skill resolution`);
}
assert.match(texts.scoutSkill, /Any `UNKNOWN` or nonempty gap is unresolved and therefore cannot support `COMPLETE`/);
assert.match(texts.scoutAgent, /not certification of evidence semantics, expected-universe validity, classification correctness, or safety/i);
assert.match(texts.scoutSkill, /does not itself certify evidence meaning, expected-universe validity, classification correctness, or safety/i);
assert.match(texts.scoutSkill, /only concrete failed IDs or a malformed counterexample/i);
assert.match(texts.scoutAgent, /two failures without a new hypothesis/i);

for (const [name, text] of [
  ["SYSTEM", texts.system],
  ["agent guide", texts.guide],
  ["builder skill", texts.builderSkill],
  ["builder agent", texts.builderAgent],
]) {
  assert.match(text, /(?:writing builder remains implementation owner through focused validation|writing builder owns implementation, focused validation|continue owning implementation, focused validation)/i, `${name}: owner-through-acceptance missing`);
  assert.match(text, /same (?:writing )?builder|same owner/i, `${name}: repairs must return to same owner`);
  assert.match(text, /(?:explicitly reassigns ownership first|explicitly reassign ownership first)/i, `${name}: takeover needs reassignment`);
}
assert.match(texts.system, /never let takeover\/reroute bypass a safety, authorization, or scope gate/i);
assert.match(texts.builderSkill, /takeover or reroute never bypasses a safety, authorization, or scope gate/i);
assert.match(texts.builderSkill, /do not write the same files in parallel/i);
assert.match(texts.system, /independent final-head review|Any PR requires one independent read-only bounded review/i);
assert.match(texts.system, /Consequential Action Gate/i);
assert.match(texts.system, /Stateful test-resource gate/i);
assert.match(texts.system, /Never merge without explicit request/i);

console.log("delegation economics smoke: PASS");
