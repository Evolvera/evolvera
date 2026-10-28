import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const removedAgent = path.join(root, "agents", `planner${"-heavy"}.md`);
const finalDescription = "Plan-heavy final synthesis";

await assert.rejects(access(removedAgent, constants.F_OK), "duplicate final planner agent must remain removed");

const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const [planner, planHeavy, plannerSkill, system, systemMirror, deadlinePatcher] = await Promise.all([
  read("agents/planner.md"),
  read("skills/plan-heavy/SKILL.md"),
  read("skills/planner/SKILL.md"),
  read("SYSTEM.md"),
  read("config/SYSTEM.md"),
  read("scripts/patch-pi-subagents-bounded-waits.mjs"),
]);

// Routing authority: normal planner follows frontmatter (GPT-6.1 Sol/high); plan-heavy final
// synthesis explicitly overrides to Astra/high. Static contract regression.
assert.match(planner, /^model: openai-codex\/gpt-6\.1-sol$/m);
assert.match(planner, /^thinking: high$/m);
assert.match(planner, /^display_name: .*GPT-6\.1 Sol · high$/m);
assert.match(planner, /Model: openai-codex\/gpt-6\.1-sol high\./);
assert.doesNotMatch(planner.split("---", 2)[1], /gpt-6-astra|gpt-6-sol|thinking:\s*(?:low|medium|xhigh|max)\b/i, "planner frontmatter must carry no stale Astra/6 Sol/low/medium/xhigh/max routing");
assert.match(planner, /## Optional Ensemble Brief Input/);
assert.match(planner, /HANDOFF\.md[\s\S]*brief_gpt\.md[\s\S]*brief_fable\.md[\s\S]*brief_gpt55\.md/);
assert.match(planner, /reconcile their disagreements/i);
assert.match(planner, /any brief is missing or empty[\s\S]*`BLOCKED`/i);
assert.match(planner, /fresh planner session[\s\S]*Never resume/i);

const briefer55 = await read("agents/plan-briefer-gpt55.md");
assert.match(briefer55, /^name: plan-briefer-gpt55$/m);
assert.match(briefer55, /^model: openai-codex\/gpt-5\.5$/m);
assert.match(briefer55, /^thinking: high$/m);
assert.match(briefer55, /brief_gpt55\.md/);

assert.match(planHeavy, /launch a fresh `planner` session/i);
assert.match(planHeavy, new RegExp(finalDescription));
assert.match(planHeavy, /explicit plan-heavy override `model: openai-codex\/gpt-6-astra` and `thinking: high`/);
assert.match(planHeavy, /plan-heavy synthesis is deliberately Astra\/high/);
assert.match(planHeavy, /unchanged prompt from `agents\/planner\.md`/);
assert.match(planHeavy, /Prompt rules for this launch/);
assert.match(planHeavy, /lean, clear, and outcome-first/);
assert.match(planHeavy, /three strategy briefs and a final planner synthesis/);
assert.doesNotMatch(
  planHeavy,
  /FINAL_PLANNER_EFFORT|max-effort|Claude Fable 5 prompt rules/i,
  "plan-heavy must use only the approved Astra/high final-planner override",
);
assert.match(planHeavy, /plan-briefer-gpt55/);
assert.match(planHeavy, /read the handoff and all briefs first/i);
assert.match(planHeavy, /If any brief is missing or empty[\s\S]*stop/i);
assert.match(plannerSkill, /reads the handoff plus all briefs, reconciles them/i);
assert.equal(system, systemMirror, "SYSTEM mirrors must remain byte-identical");
assert.match(
  system,
  /three parallel briefs → a fresh planner synthesis using the unchanged planner prompt with explicit `openai-codex\/gpt-6-astra` \/ `high` routing/i,
);
assert.match(plannerSkill, /no hardcoded model or effort override/i);

assert.match(deadlinePatcher, /DEFAULT_AGENT_TIMEOUT_MS = 30 \* 60_000/);
assert.match(deadlinePatcher, /PLANNER_TIMEOUT_MS = 60 \* 60_000/);
assert.match(deadlinePatcher, /record\.type === "planner" \? PLANNER_TIMEOUT_MS/);
assert.match(deadlinePatcher, /activeAttempts\.has\(id\)/);
assert.match(deadlinePatcher, /signal: controller\.signal/);
assert.match(deadlinePatcher, /record\.error !== ATTEMPT_TIMEOUT_REASON/);
assert.doesNotMatch(planHeavy, /watchdog|watchdog remains scoped/i);

async function collectActiveFiles(relativeDir) {
  const base = path.join(root, relativeDir);
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (/\.(?:md|ts|mjs)$/.test(entry.name)) files.push(full);
    }
  }
  await walk(base);
  return files;
}

const activeFiles = [
  path.join(root, "SYSTEM.md"),
  path.join(root, "config", "SYSTEM.md"),
  ...(await collectActiveFiles("agents")),
  ...(await collectActiveFiles("extensions")),
  ...(await collectActiveFiles("skills")),
];
const staleAgentName = `planner${"-heavy"}`;
for (const file of activeFiles) {
  if (file === fileURLToPath(import.meta.url)) continue;
  const text = await readFile(file, "utf8");
  assert.doesNotMatch(text, new RegExp(`\\b${staleAgentName}\\b`, "i"), `${path.relative(root, file)} has a stale agent route`);
}

await assert.rejects(access(path.join(root, "extensions/subagent-watchdog.ts"), constants.F_OK));

console.log("planner consolidation smoke: PASS");
