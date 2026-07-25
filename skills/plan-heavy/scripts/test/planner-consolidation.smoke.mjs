import assert from "node:assert/strict";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
} from "node:fs/promises";
import { constants } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const removedAgent = path.join(root, "agents", `planner${"-heavy"}.md`);
const finalDescription = "Plan-heavy final synthesis";

await assert.rejects(access(removedAgent, constants.F_OK), "duplicate final planner agent must remain removed");

const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const [planner, planHeavy, plannerSkill, system, systemMirror, watchdog] = await Promise.all([
  read("agents/planner.md"),
  read("skills/plan-heavy/SKILL.md"),
  read("skills/planner/SKILL.md"),
  read("SYSTEM.md"),
  read("config/SYSTEM.md"),
  read("extensions/subagent-watchdog.ts"),
]);

assert.match(planner, /model: openai-codex\/gpt-5\.6-sol/);
assert.match(planner, /thinking: xhigh/);
assert.match(planner, /## Optional Two-Brief Ensemble Input/);
assert.match(planner, /HANDOFF\.md[\s\S]*brief_gpt\.md[\s\S]*brief_fable\.md/);
assert.match(planner, /reconcile their disagreements/i);
assert.match(planner, /either brief is missing or empty[\s\S]*`BLOCKED`/i);
assert.match(planner, /fresh planner session[\s\S]*Never resume/i);

assert.match(planHeavy, /launch a fresh `planner` session/i);
assert.match(planHeavy, new RegExp(finalDescription));
assert.match(planHeavy, /read the handoff and both briefs first/i);
assert.match(planHeavy, /If one brief is missing or empty[\s\S]*stop/i);
assert.match(plannerSkill, /fresh `planner` session reads the handoff plus both briefs, reconciles them/i);
assert.equal(system, systemMirror, "SYSTEM mirrors must remain byte-identical");
assert.match(system, /two parallel briefs → a fresh planner xhigh synthesis/i);

assert.match(watchdog, /const TARGET_AGENT = "planner"/);
assert.match(watchdog, new RegExp(`const PLAN_HEAVY_DESCRIPTION = "${finalDescription}"`));
assert.match(watchdog, /isPlanHeavyPlanner\(event\.type, event\.description\)/);

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

const sandbox = await mkdtemp(path.join(tmpdir(), "planner-consolidation-smoke-"));
const managerKey = Symbol.for("pi-subagents:manager");
try {
  const packageRoot = path.resolve(root, "../../npm-global/lib/node_modules/@earendil-works/pi-coding-agent");
  const scopeDir = path.join(sandbox, "node_modules", "@earendil-works");
  await mkdir(scopeDir, { recursive: true });
  await symlink(packageRoot, path.join(scopeDir, "pi-coding-agent"), "dir");
  const extensionCopy = path.join(sandbox, "subagent-watchdog.ts");
  await cp(path.join(root, "extensions", "subagent-watchdog.ts"), extensionCopy);
  const require = createRequire(import.meta.url);
  const jitiPath = path.resolve(
    root,
    "../../npm-global/lib/node_modules/@tintinweb/pi-subagents/node_modules/jiti/lib/jiti.cjs",
  );
  const { createJiti } = require(jitiPath);
  const jiti = createJiti(import.meta.url);
  const mod = await jiti.import(extensionCopy);

  assert.equal(mod.isPlanHeavyPlanner("planner", finalDescription), true);
  assert.equal(mod.isPlanHeavyPlanner("planner", "Normal plan"), false);
  assert.equal(mod.isPlanHeavyPlanner(staleAgentName, finalDescription), false);

  const handlers = new Map();
  const busHandlers = new Map();
  const pi = {
    appendEntry() {},
    events: {
      emit() {},
      on(name, handler) {
        busHandlers.set(name, handler);
        return () => busHandlers.delete(name);
      },
    },
    on(name, handler) {
      handlers.set(name, handler);
    },
  };
  mod.default(pi);
  assert.ok(handlers.has("tool_call"));

  let record = { type: "planner", description: finalDescription };
  globalThis[managerKey] = { getRecord: () => record };
  const blocked = await handlers.get("tool_call")({ toolName: "Agent", input: { resume: "plan-heavy-id" } });
  assert.equal(blocked?.block, true);
  assert.match(blocked?.reason ?? "", /Start a fresh planner run/);

  record = { type: "planner", description: "Normal plan" };
  const allowed = await handlers.get("tool_call")({ toolName: "Agent", input: { resume: "normal-id" } });
  assert.equal(allowed, undefined, "normal planner resume behavior must remain unchanged");
} finally {
  delete globalThis[managerKey];
  await rm(sandbox, { recursive: true, force: true });
}

console.log("planner consolidation smoke: PASS");
