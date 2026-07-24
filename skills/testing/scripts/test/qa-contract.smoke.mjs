#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../..");
const read = (path) => readFileSync(resolve(repo, path), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

function frontmatter(text, label) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert(match, `${label}: missing frontmatter`);
  const result = {};
  for (const line of match[1].split("\n")) {
    const field = line.match(/^([a-z_]+):\s*(.*)$/);
    assert(field, `${label}: malformed frontmatter line: ${line}`);
    result[field[1]] = field[2].replace(/^"|"$/g, "");
  }
  return result;
}

const levels = Object.freeze(["CORE", "FULL"]);
const verdicts = Object.freeze(["PASS", "BLOCKED", "UNVERIFIED"]);

function evaluateScenario(scenario) {
  assert(levels.includes(scenario.level), `invalid QA level: ${scenario.level}`);
  if (scenario.phase === "HARNESS_BUILD") {
    return {
      mayExecute: false,
      verdict: null,
      mustStopForCheckpoint: true,
      requiresFreshReadOnlyRun: true,
    };
  }
  if (scenario.phase === "FRESH_HARNESS_RUN" && (!scenario.freshSession || !scenario.newSha || !scenario.sourceReadOnly)) {
    return { mayExecute: false, verdict: "UNVERIFIED" };
  }
  if (scenario.resources !== "NO_STATEFUL_RESOURCES" && scenario.resources !== "ALL_DISPOSABLE_VERIFIED") {
    return { mayExecute: false, verdict: "UNVERIFIED" };
  }
  if (scenario.level === "FULL" && scenario.browserRequired && scenario.browserEvidence !== "REAL_BROWSER") {
    return { mayExecute: true, verdict: "UNVERIFIED", browserClaim: false };
  }
  if (scenario.firstFailure) {
    return { mayExecute: true, verdict: "BLOCKED", cleanPass: false, flaky: Boolean(scenario.retryPassed) };
  }
  if (!scenario.requiredAcceptanceExercised) return { mayExecute: true, verdict: "UNVERIFIED" };
  return {
    mayExecute: true,
    verdict: "PASS",
    claim: scenario.level === "CORE" ? "DECLARED_CORE_SCOPE_ONLY" : "ALL_REQUIRED_FULL_SURFACES",
  };
}

try {
  const qa = read("agents/qa.md");
  const qaFm = frontmatter(qa, "agents/qa.md");
  assert(qaFm.name === "qa", "qa agent name mismatch");
  assert(qaFm.model === "openai-codex/gpt-5.6-sol", "qa model mismatch");
  assert(qaFm.thinking === "high", "qa thinking mismatch");
  assert(qaFm.display_name === "🧪 QA · GPT-5.6 Sol · high", "qa display_name mismatch");
  assert(qaFm.prompt_mode === "replace" && qaFm.inherit_context === "false" && qaFm.extensions === "false" && qaFm.skills === "false", "qa isolation frontmatter mismatch");
  assert(qaFm.tools.split(/,\s*/).join(",") === "read,grep,find,ls,bash,write,edit", "qa tool contract mismatch");

  const agentIdentities = readdirSync(resolve(repo, "agents"))
    .filter((name) => name.endsWith(".md"))
    .map((name) => frontmatter(read(`agents/${name}`), `agents/${name}`).name)
    .filter((name) => name === "qa");
  assert(agentIdentities.length === 1, `expected one qa agent identity, found ${agentIdentities.length}`);
  const qaSkillPath = resolve(repo, "skills/qa");
  assert(!statExists(qaSkillPath), "a second qa skill exists");

  const testing = read("skills/testing/SKILL.md");
  const testingFm = frontmatter(testing, "skills/testing/SKILL.md");
  assert(testingFm.name === "testing", "testing skill identity changed");
  assert(testing.includes("Exactly one dedicated agent, `qa`"), "testing does not route to sole qa agent");
  assert(testing.includes("Direct deterministic closure is outside QA, not a third level"), "direct closure boundary missing");
  assert(testing.includes("Launch only `subagent_type: \"qa\"`"), "qa invocation contract missing");
  assert(testing.includes("`CORE PASS` is bounded to its declared CORE scope"), "CORE claim boundary missing");
  assert(testing.includes("browser claims require a real browser"), "real-browser requirement missing");
  assert(testing.includes("BrowserContext isolates browser state, not backend resources"), "browser/backend isolation distinction missing");
  assert(testing.includes("pass-after-retry is flaky and cannot become clean `PASS`"), "first-failure/flaky rule missing");
  assert(testing.includes("Coverage is diagnostic, never a universal threshold"), "coverage caveat missing");
  assert(testing.includes("new fresh source-read-only `qa` session bound to the new SHA"), "fresh harness certification separation missing");
  for (const verdict of verdicts) assert(testing.includes(verdict), `missing verdict ${verdict}`);

  const headings = [...testing.matchAll(/^### (CORE|FULL)$/gm)].map((match) => match[1]);
  assert(JSON.stringify(headings) === JSON.stringify(levels), `expected exactly CORE/FULL level headings, got ${headings.join(",")}`);

  for (const path of [
    "skills/testing/references/core-qa.md",
    "skills/testing/references/full-qa.md",
    "skills/testing/references/research.md",
    "skills/testing/templates/qa-handoff.md",
    "skills/testing/scripts/inventory-qa-surfaces.mjs",
  ]) assert(read(path).trim().length > 0, `${path}: missing or empty`);

  const handoff = read("skills/testing/templates/qa-handoff.md");
  assert(handoff.includes("Testing skill root: [absolute"), "handoff lacks absolute global skill root");
  assert(handoff.includes("Selected reference: [absolute"), "handoff lacks absolute selected reference");
  assert(handoff.includes("never substitute a project-local skill"), "handoff permits project-local policy shadowing");
  assert(handoff.includes("`BUILD_ONLY`: no QA verdict"), "harness build output conflicts with QA verdict contract");

  const routes = [
    "SYSTEM.md", "config/SYSTEM.md", "skills/builder/SKILL.md",
    "skills/planner/SKILL.md", "skills/agent-guide/SKILL.md",
  ];
  for (const path of routes) {
    const text = read(path);
    assert(text.includes("`qa`"), `${path}: qa route missing`);
    assert(text.includes("CORE") && text.includes("FULL"), `${path}: two-level route missing`);
  }
  assert(read("SYSTEM.md") === read("config/SYSTEM.md"), "SYSTEM mirrors differ");

  const stale = /POST-BUILD TEST MODE|Post-build testing mode|fresh `builder` testing session|fresh builder tester|builder-heavy testing session/;
  for (const path of ["SYSTEM.md", "config/SYSTEM.md", "agents/builder.md", ...routes.slice(2), "skills/testing/SKILL.md"]) {
    assert(!stale.test(read(path)), `${path}: obsolete builder-testing route remains`);
  }

  const scenarios = [
    {
      name: "bounded CORE",
      input: { level: "CORE", resources: "NO_STATEFUL_RESOURCES", requiredAcceptanceExercised: true },
      expect: { mayExecute: true, verdict: "PASS", claim: "DECLARED_CORE_SCOPE_ONLY" },
    },
    {
      name: "safe FULL with real browser",
      input: { level: "FULL", resources: "ALL_DISPOSABLE_VERIFIED", browserRequired: true, browserEvidence: "REAL_BROWSER", requiredAcceptanceExercised: true },
      expect: { mayExecute: true, verdict: "PASS", claim: "ALL_REQUIRED_FULL_SURFACES" },
    },
    {
      name: "unsafe FULL",
      input: { level: "FULL", resources: "UNKNOWN", browserRequired: true, browserEvidence: "REAL_BROWSER", requiredAcceptanceExercised: false },
      expect: { mayExecute: false, verdict: "UNVERIFIED" },
    },
    {
      name: "mocked browser is partial",
      input: { level: "FULL", resources: "NO_STATEFUL_RESOURCES", browserRequired: true, browserEvidence: "MOCKED_DOM", requiredAcceptanceExercised: true },
      expect: { mayExecute: true, verdict: "UNVERIFIED", browserClaim: false },
    },
    {
      name: "harness build stops before certification",
      input: { level: "FULL", phase: "HARNESS_BUILD", resources: "NO_STATEFUL_RESOURCES", requiredAcceptanceExercised: false },
      expect: { mayExecute: false, verdict: null, mustStopForCheckpoint: true, requiresFreshReadOnlyRun: true },
    },
    {
      name: "fresh harness run owns verdict",
      input: { level: "FULL", phase: "FRESH_HARNESS_RUN", freshSession: true, newSha: true, sourceReadOnly: true, resources: "NO_STATEFUL_RESOURCES", requiredAcceptanceExercised: true },
      expect: { mayExecute: true, verdict: "PASS", claim: "ALL_REQUIRED_FULL_SURFACES" },
    },
  ];
  for (const scenario of scenarios) {
    const observed = evaluateScenario(scenario.input);
    assert(JSON.stringify(observed) === JSON.stringify(scenario.expect), `${scenario.name}: ${JSON.stringify(observed)}`);
  }

  const flaky = evaluateScenario({ level: "CORE", resources: "NO_STATEFUL_RESOURCES", requiredAcceptanceExercised: true, firstFailure: true, retryPassed: true });
  assert(flaky.verdict === "BLOCKED" && flaky.flaky && !flaky.cleanPass, "retry erased first failure");

  console.log(`PASS: QA frontmatter, route closure, mirrors, and ${scenarios.length} scenario contracts`);
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
}

function statExists(path) {
  try { return statSync(path).isDirectory() || statSync(path).isFile(); } catch { return false; }
}
