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
// Literal obedience: an explicit user instruction about agent count, 1:1 mapping, model, or agent type is binding.
// Expected: the anchor exists in the orchestrator prompt and outranks routing heuristics (fronts/grouping/KISS),
// with only Safety able to limit it and the limit reported instead of reinterpreted. Why: a Sanvera orchestrator
// grouped ~29 tasks into 4 agents and silently ran GPT instead of the Claude Opus the user ordered.
const obedience = section("Explicit agent instructions are literal", "Bundled requests");
assert.match(obedience, /count|quantity|how many/i, "agent count is binding");
assert.match(obedience, /one (agent )?per|1:1/i, "one-per-task mapping is binding");
assert.match(obedience, /model/i, "requested model is binding");
assert.match(obedience, /agent type/i, "requested agent type is binding");
assert.match(obedience, /fronts?.*group|group.*fronts?/i, "it outranks front grouping");
assert.match(obedience, /KISS|ceremony/i, "it outranks KISS / no-ceremony heuristics");
assert.match(obedience, /Safety/, "only Safety gates may limit it");
assert.match(obedience, /report|tell the user|say so/i, "a Safety limit is reported, not reinterpreted");
assert.match(obedience, /effective model line/i, "verify the effective model line after launch");
// Live run: an overridden scout showed "Scout · GPT-6 Luna · medium" as its name while the effective line said
// "gpt-5.3 codex spark"; the name suffix is the type default, so the rule must point at the effective line.
assert.match(obedience, /type'?s default/i, "the display-name suffix is only the type's default");
assert.equal(readFileSync(path.join(root, "SYSTEM.md"), "utf8"), system, "SYSTEM.md and config/SYSTEM.md stay identical");

// agent-guide documents which agent types pin a model, so a requested model maps to the right type.
// Expected: a table row naming builder-heavy-design with Claude Opus. Why: builder-heavy pins GPT-6.1 Sol.
const agentGuide = readFileSync(path.join(root, "skills/agent-guide/SKILL.md"), "utf8");
assert.match(agentGuide, /## Agent models and overrides/, "agent-guide has the model/override section");
assert.match(agentGuide, /\|\s*`builder-heavy-design`\s*\|[^\n]*claude-opus/i, "builder-heavy-design maps to Claude Opus");
assert.match(agentGuide, /\|\s*`builder-heavy`\s*\|[^\n]*gpt-6\.1-sol/i, "builder-heavy maps to GPT-6.1 Sol");
assert.match(agentGuide, /literal/i, "agent-guide repeats the literal-obedience rule");
assert.match(agentGuide, /effective model line/i, "agent-guide points at the effective model line, not the display name");

console.log("delivery-contract ok: history, deliverable, real-journey, and literal-obedience guardrails");
