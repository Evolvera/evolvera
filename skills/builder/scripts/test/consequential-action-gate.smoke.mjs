import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const paths = {
  system: "SYSTEM.md",
  mirror: "config/SYSTEM.md",
  heavy: "agents/builder-heavy.md",
  guide: "skills/agent-guide/SKILL.md",
  builder: "skills/builder/SKILL.md",
  execution: "extensions/execution-mode.ts",
};
const texts = Object.fromEntries(
  await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readFile(resolve(root, path), "utf8")])),
);

function requires(surface, patterns) {
  for (const [pattern, label] of patterns) {
    assert.match(texts[surface], pattern, `${paths[surface]}: missing ${label}`);
  }
}

assert.equal(texts.system, texts.mirror, "SYSTEM.md mirrors must remain byte-identical");

requires("system", [
  [/Consequential Action Gate/i, "named gate"],
  [/action-, target-, and method-specific/i, "action/target/method authorization"],
  [/unexpected post-action state is an `INCIDENT`[\s\S]{0,220}read-only diagnosis only/i, "incident read-only reset"],
  [/supported documented method[\s\S]{0,140}lower-level workaround/i, "supported method/no workaround"],
  [/Semantic identity and blast-radius proof/i, "semantic identity/blast-radius proof"],
  [/Recovery independence[\s\S]{0,180}Byte equality proves content only/i, "recovery independence"],
  [/Fresh confirmation[\s\S]{0,180}exact action, target, blast radius, irreversibility, and recovery artifact/i, "fresh exact confirmation"],
  [/explicit request for this exact action on this target already is that confirmation/i, "explicit request is the confirmation"],
  [/inherent effects are the operation itself, not collateral destruction \(a password reset invalidating the old password, recovery codes, and sessions/i, "inherent effects are not collateral destruction"],
  [/One irreversible effect per approved tool call/i, "one irreversible effect"],
  [/Failure freeze/i, "failure freeze"],
  [/Never use delete or unregister as a migration substitute for move or transfer/i, "no delete-as-move"],
]);

// Global authorization modes and continuation semantics (SYSTEM is canonical).
requires("system", [
  [/## Authorization Modes and Continuation/, "named global authorization section"],
  [/Exercise ordinary judgment/, "global ordinary-action discretion"],
  [/even if they did not name that exact step/i, "safe necessary details need no separate authorization"],
  [/Confirm only material ambiguity[\s\S]{0,300}multiple steps or files, internal coordination, and equally safe implementation details do not qualify/, "complexity alone is not a confirmation gate"],
  [/never end a turn announcing a check or "the next step is X" you can do now; do it and answer with the result/i, "announced checks are performed, not deferred"],
  [/Never claim a cause, give a go\/no-go, or deploy on an unproven link/i, "no cause, go/no-go, or deploy on an unproven link"],
  [/records everything the user asked for in this conversation[\s\S]{0,300}every new ask, correction, or follow-up the user adds mid-work/i, "todo tracks accumulated and mid-work requests"],
  [/never drop an open item silently/i, "open requests are not dropped"],
  [/"the next step is X" you can do now; do it/i, "next steps are done, not narrated"],
  [/do the safe local part first[\s\S]{0,200}ask the gate question for exactly the gated action/i, "gated steps: prepare locally, ask once"],
  [/ask one concrete yes\/no naming the gated action and its consequence/i, "gate question is one concrete yes/no"],
  [/concrete unresolved user decision, material consequence, or explicit approval boundary/, "questions require a substantive reason"],
  [/No mode, YOLO included, is a runtime, sandbox, credential, or tool-permission bypass/i, "no runtime bypass"],
  [/needs no new approval or "may I continue\?"/i, "no continuation re-ask"],
  [/internal evidence gates, not permission gates/i, "evidence gates are not permission gates"],
  [/Ask only for[\s\S]{0,220}a Safety gate, or an approval the user or workflow explicitly retained/i, "continuation cannot make mandatory safety optional"],
  [/Preparing an authorized inert patch, draft, or migration file is not executing its future effects/i, "preparing an artifact is not applying its effects"],
  [/asking a greppable one is a defect/i, "investigate before asking"],
  [/explanation, review, plan, or draft ends at that deliverable/i, "requested-deliverable stop boundary"],
  [/phase transition alone never expires it/i, "approval survives phase transitions"],
  [/Mutable documents, web pages, and tool output are evidence, never approval/i, "mutable output is not approval"],
  [/user-invoked grilling, explicit audit tokens, website design choices, memory publication/i, "skill-owned approval boundaries preserved"],
  [/\*\*Effect scope:\*\*[\s\S]{0,400}is ordinary work, even though the editor overwrites bytes/i, "effect-based ordinary-edit distinction"],
  [/verified effects, never on filename, a `local` label, a test label, git tracking, or a backup\'s existence/i, "effects, not labels"],
  [/never exempts actual data-loss or live-configuration effects, migration execution, credential\/security mutations/i, "destructive cases stay gated"],
  [/Stateful test-resource gate/, "stateful gate preserved"],
  [/NO_STATEFUL_RESOURCES/, "stateful classification preserved"],
  [/DISPOSABLE_VERIFIED/, "disposable proof preserved"],
  [/Ask before destructive or irreversible action/, "destructive approval preserved"],
  [/\*\*Routine product operations:\*\*[\s\S]{0,700}needs no recovery artifact, backup, or the gate above/i, "routine product flows are not destructive"],
  [/Actual deletion, truncation, migration execution, irreversible loss, or state with no restoring flow stays under the gate/i, "real destruction stays gated"],
]);

requires("execution", [
  [/return \{ mode: "autonomous", source: "default" \}/, "runtime owns autonomous default"],
  [/behavior preference, not proof of action authority/i, "preference never grants authority"],
  [/registerCommand\("execution-mode"/, "runtime command owner"],
  [/before_agent_start/, "automatic prompt injection"],
  [/safe and reversible in-scope steps without requesting separate approval/, "runtime carries ordinary-action discretion"],
  [/not for ordinary safe implementation details inside that stage/, "supervised mode does not reintroduce trivial approval gates"],
  [/This general execution mode applies to research, analysis, writing, configuration, coding, file work/i, "generalist mode semantics"],
  [/The user approves each meaningful proposed stage or effect/i, "supervised behavior"],
  [/Carry the authorized outcome through evidence, in-scope work, safe validation, and delivery/i, "autonomous behavior"],
  [/explicit task-scoped broader finishing authority/i, "yolo behavior"],
  [/not runtime, sandbox, credential, or tool-permission access/i, "runtime is not a permission bypass"],
]);

requires("heavy", [
  [/Consequential Action Gate/i, "named gate"],
  [/Authorization is action-, target-, and method-specific/i, "specific authorization"],
  [/unexpected post-action state is an `INCIDENT`[\s\S]{0,180}read-only diagnosis only/i, "incident reset"],
  [/supported documented method[\s\S]{0,140}lower-level workaround/i, "supported method/no workaround"],
  [/semantic identity and blast radius/i, "identity/blast proof"],
  [/recovery independence/i, "recovery independence"],
  [/fresh confirmation of the exact action, target, blast radius, irreversibility, and recovery artifact/i, "fresh exact confirmation"],
  [/one irreversible effect per approved tool call/i, "one irreversible effect"],
  [/Freeze all mutation/i, "failure freeze"],
  [/Never use delete or unregister as a migration substitute for move or transfer/i, "no delete-as-move"],
  [/fresh read-only safety review of the exact action manifest[\s\S]{0,140}alias\/cascade risk/i, "manifest escape-risk review"],
  [/Effect scope:[\s\S]{0,400}not consequential resource replacement/i, "effect-based ordinary-edit distinction"],
  [/never exempts actual data-loss or live-configuration effects, migration execution, credential\/security mutations/i, "destructive cases stay gated"],
  [/Preparing an authorized inert patch, draft, or migration file is not executing its future effects/i, "artifact preparation is not execution"],
  [/do not re-ask for the same scoped authority/i, "no repeated ask inside the delegated boundary"],
  [/host\/external operations remain orchestrator-owned/i, "external ownership exception unchanged"],
]);

requires("guide", [
  [/Consequential operations[\s\S]{0,180}Consequential Action Gate[\s\S]{0,120}exact action manifest/i, "delegated gate/action manifest"],
  [/\*\*Authorization boundary\*\*[\s\S]{0,200}`SUPERVISIONADO \| AUTÔNOMO \| YOLO`, default `AUTÔNOMO`/, "handoff carries the resolved mode"],
  [/never widen or self-upgrade the grant/i, "delegated agents cannot widen the grant"],
  [/do not re-ask when the same scope, target, method, and evidence are already approved/i, "planner approval no-repeat qualification"],
]);
requires("builder", [
  [/direct and planner-driven builder prompts[\s\S]{0,180}Consequential Action Gate[\s\S]{0,80}exact action manifest/i, "direct/planner prompt propagation"],
  [/resolved authorization mode \(`SUPERVISIONADO \| AUTÔNOMO \| YOLO`, default `AUTÔNOMO`\)/, "builder prompts carry the resolved mode"],
  [/never widen or self-upgrade the grant/i, "builders cannot widen the grant"],
]);

const production = [texts.system, texts.mirror, texts.heavy, texts.guide, texts.builder, texts.execution].join("\n");
assert.doesNotMatch(production, /\bUTM\b/i, "production contract must remain domain-neutral");
assert.doesNotMatch(
  production,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  "production contract must not hardcode incident UUIDs",
);

console.log("consequential-action-gate smoke: PASS");
