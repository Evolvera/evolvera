import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const plannerFiles = [
  "agents/planner.md",
  "skills/planner/SKILL.md",
  "skills/plan-heavy/SKILL.md",
];
const builderPrompts = [
  "agents/builder.md",
  "agents/builder-light.md",
  "agents/builder-heavy.md",
  "agents/builder-design.md",
  "agents/builder-heavy-design.md",
];
const builderSkills = ["skills/builder/SKILL.md", "skills/agent-guide/SKILL.md"];
const flowPath = "skills/flow-orca/SKILL.md";
const templatePaths = ["templates/builder/TILL-DO.md", "templates/builder/TODO.md"];
const files = [
  "SYSTEM.md",
  "config/SYSTEM.md",
  ...plannerFiles,
  ...builderPrompts,
  ...builderSkills,
  flowPath,
  ...templatePaths,
];
const texts = new Map(
  await Promise.all(files.map(async (path) => [path, await readFile(resolve(root, path), "utf8")])),
);

function requireMatch(path, pattern, message) {
  assert.match(texts.get(path), pattern, `${path}: ${message}`);
}

assert.equal(
  texts.get("SYSTEM.md"),
  texts.get("config/SYSTEM.md"),
  "SYSTEM.md and config/SYSTEM.md must remain byte-identical",
);
requireMatch("SYSTEM.md", /internal order[\s\S]{0,180}TILL-DO[\s\S]{0,180}(before|prior to)[\s\S]{0,80}TODO[\s\S]{0,80}(editing|source)/i, "missing concise global readiness rule");
requireMatch("SYSTEM.md", /simple tasks[^.\n]*artifact-free/i, "simple tasks must remain artifact-free by default");
requireMatch("agents/builder-light.md", /^model: openai-codex\/gpt-6-luna$/m, "builder-light must use GPT-6 Luna medium");
requireMatch("agents/builder-light.md", /^thinking: medium$/m, "builder-light must remain medium effort");
requireMatch("agents/builder.md", /^model: openai-codex\/gpt-6-luna$/m, "builder must use Luna");
requireMatch("agents/builder.md", /^thinking: high$/m, "builder must remain high effort");
requireMatch("agents/builder-heavy.md", /^model: openai-codex\/gpt-6-luna$/m, "builder-heavy must use Luna");
requireMatch("agents/builder-heavy.md", /^thinking: xhigh$/m, "builder-heavy must use xhigh effort");

for (const path of plannerFiles) {
  requireMatch(path, /Internal Execution Order/i, "missing ordered-task contract");
  requireMatch(path, /omit[^.\n]*(simple[^.\n]*(local|homogeneous)|simple\/local\/homogeneous)/i, "simple tasks must omit internal order");
  requireMatch(path, /file count alone never activates|never activate[^.\n]*file count/i, "file count alone must not activate ordering");
  requireMatch(path, /builder[^.\n]*(never the planner|not the planner)|builder[—-]not the planner/i, "builder, not planner, must own lifecycle artifacts");
  requireMatch(path, /TILL-DO_<task-id>\.md/i, "task contract must name task-ID TILL-DO");
  requireMatch(path, /TILL-DO[\s\S]{0,220}(before|prior to)[^\n]*(TODO|source mutation)/i, "TILL-DO must precede TODO and source mutation");
  requireMatch(path, /Only all[^.\n]*PASS|Only all `PASS`|all-`PASS` readiness permits/i, "all readiness gates must pass");
  requireMatch(path, /blocked gate[^.\n]*(no source mutation|no source)[^.\n]*(?:and no|or no|or) (?:misleading )?TODO|no source mutation[^.\n]*(?:and no|or no|or) (?:misleading )?TODO/i, "blocked readiness must prevent source mutation and TODO");
  requireMatch(path, /TODO_<task-id>\.md/i, "task contract must name task-ID TODO");
  requireMatch(path, /not tasks[^.\n]*(commits|task IDs)|not tasks, IDs[^.\n]*commits/i, "lifecycle artifacts must not expand task authority");
  requireMatch(path, /selective product commit|selective commit/i, "transient artifacts must stay outside the product commit by default");
}

for (const path of [...builderPrompts, ...builderSkills]) {
  requireMatch(path, /TILL-DO_<task-id>\.md/i, "missing TILL-DO path");
  requireMatch(path, /(Before any source edit|before source mutation)/i, "must prohibit source edits before readiness");
  requireMatch(path, /(every gate must be `PASS`|Only after all gates pass|Only all `PASS` permits)/i, "all gates must pass before execution");
  requireMatch(path, /(BLOCKED[^.\n]*(no source mutation|no source)[^.\n]*no TODO|no source mutation[^.\n]*no TODO)/i, "failed readiness must not create TODO or mutate source");
  requireMatch(path, /TODO_<task-id>\.md/i, "missing TODO path");
  requireMatch(path, /authority\/baseline/i, "missing authority/baseline gate");
  requireMatch(path, /contract\/scope/i, "missing contract/scope gate");
  requireMatch(path, /validation\/resources/i, "missing validation/resources gate");
  requireMatch(path, /recovery\/stop/i, "missing recovery/stop gate");
  requireMatch(path, /simple tasks[^.\n]*(create neither artifact|proceed directly|artifact)/i, "simple tasks must remain artifact-free by default");
  requireMatch(path, /completed\/current\/next|completed, current, and next/i, "TODO/resume must record phase position");
  requireMatch(path, /(repository|repo)\/diff evidence/i, "resume must verify repository and diff evidence");
  requireMatch(path, /transient[^.\n]*(execution state|task-local execution state)/i, "artifacts must be transient execution state");
  requireMatch(path, /selective product commit/i, "artifacts must be excluded from product commit by default");
}
assert.equal(builderPrompts.length, 5, "smoke must cover all five builder prompts");
const builderSkill = texts.get("skills/builder/SKILL.md");
assert.doesNotMatch(
  builderSkill,
  /target files plus its `.pi\/build`\/`.pi\/recovery` artifacts/i,
  "builder checkpoint guidance must not commit transient TILL-DO/TODO by default",
);
assert.match(
  builderSkill,
  /Exclude transient TILL-DO\/TODO files unless the task explicitly requires them tracked/i,
  "builder checkpoint guidance must preserve the transient-artifact exclusion",
);

requireMatch(flowPath, /Internal Execution Order bridge/i, "missing Flow bridge");
requireMatch(flowPath, /TILL-DO_<task-id>\.md[\s\S]{0,100}TODO_<task-id>\.md/i, "Flow must preserve both lifecycle artifacts");
requireMatch(flowPath, /(apenas dentro|only within)[^.\n]*workspace Orca[^.\n]*(nunca|never)[^.\n]*checkout canônico/i, "artifacts must remain inside the issue's Orca workspace and never the canonical checkout");
requireMatch(flowPath, /nunca os converta[^.\n]*Flow\/GitHub/i, "artifacts must not become Flow/GitHub state");
requireMatch(flowPath, /nem os inclua no commit|not[^.\n]*commit/i, "artifacts must not be committed by default");
requireMatch(flowPath, /bloqueado[^.\n]*não cria TODO[^.\n]*mutação de fonte/i, "blocked readiness must prevent TODO and source mutation");

const tillDo = texts.get("templates/builder/TILL-DO.md");
for (const gate of ["Authority / baseline", "Contract / scope", "Validation / resources", "Recovery / stop"]) {
  assert.match(tillDo, new RegExp(gate.replace("/", "\\/"), "i"), `TILL-DO template: missing ${gate}`);
}
assert.match(tillDo, /PASS \| BLOCKED/g, "TILL-DO template: missing gate statuses");
assert.match(tillDo, /Evidence:/i, "TILL-DO template: missing evidence fields");
assert.match(tillDo, /NO_STATEFUL_RESOURCES \| DISPOSABLE_VERIFIED \| BLOCKED/i, "TILL-DO template: missing resource verdicts");
assert.match(tillDo, /Base\/current SHA and status/i, "TILL-DO template: missing baseline state");
assert.match(tillDo, /dirty exclusions/i, "TILL-DO template: missing dirty exclusions");

const todo = texts.get("templates/builder/TODO.md");
for (const field of ["Outcome", "Primary authorized files/symbols", "Material prerequisite", "Local exit evidence", "Changed files"]) {
  assert.match(todo, new RegExp(field.replace("/", "\\/"), "i"), `TODO template: missing ${field}`);
}
assert.match(todo, /pending \| in_progress \| complete \| blocked/i, "TODO template: missing phase statuses");
assert.match(todo, /Completed phase\(s\)/i, "TODO template: missing completed phase");
assert.match(todo, /Current phase/i, "TODO template: missing current phase");
assert.match(todo, /Next phase/i, "TODO template: missing next phase");
assert.match(todo, /repository status and focused diff evidence/i, "TODO template: missing resume verification");

const templates = `${tillDo}\n${todo}`;
for (const forbidden of [/path\/to\//i, /src\/components/i, /tool call budget/i, /calls remaining/i, /progress\s*\|?\s*\[/i, /Step\s+(?:1|2|3|4|N)\b/i]) {
  assert.doesNotMatch(templates, forbidden, `templates contain hardcoded example ceremony: ${forbidden}`);
}

const contractText = [
  ...plannerFiles,
  ...builderPrompts,
  ...builderSkills,
  flowPath,
  ...templatePaths,
].map((path) => texts.get(path)).join("\n");
for (const forbidden of ["Nazca", "CRM", "Portal", "DFC"]) {
  assert.doesNotMatch(contractText, new RegExp(`\\b${forbidden}\\b`, "i"), `contract must remain domain-neutral; found ${forbidden}`);
}
assert.doesNotMatch(contractText, /(?:exactly|universal(?:ly)?)\s+(?:ten|10|four|4)[- ]phase|(?:ten|10|four|4)\s+phases/i, "contract must not prescribe a universal exact phase recipe");
assert.doesNotMatch(contractText, /Phase 1[\s\S]{0,120}Phase 2[\s\S]{0,120}Phase 3[\s\S]{0,120}Phase 4/i, "contract must not hardcode a fixed phase sequence");

console.log(`internal-execution-order smoke: PASS (${plannerFiles.length} planner surfaces, ${builderPrompts.length} builder prompts, ${builderSkills.length} builder skills, Flow Orca, templates, SYSTEM mirrors)`);
