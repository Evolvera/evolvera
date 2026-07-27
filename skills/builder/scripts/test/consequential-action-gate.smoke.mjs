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
  [/action-specific, target-specific, and method-specific/i, "action/target/method authorization"],
  [/unexpected post-action state is an `INCIDENT`[\s\S]{0,220}read-only diagnosis only/i, "incident read-only reset"],
  [/supported documented method[\s\S]{0,140}lower-level workaround/i, "supported method/no workaround"],
  [/Semantic identity and blast-radius proof/i, "semantic identity/blast-radius proof"],
  [/Recovery independence[\s\S]{0,180}Byte equality proves content only/i, "recovery independence"],
  [/Fresh confirmation[\s\S]{0,180}exact action, target, blast radius, irreversibility, and recovery artifact/i, "fresh exact confirmation"],
  [/One irreversible effect per approved tool call/i, "one irreversible effect"],
  [/Failure freeze/i, "failure freeze"],
  [/Never use delete or unregister as a migration substitute for move or transfer/i, "no delete-as-move"],
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
]);

requires("guide", [
  [/Consequential operations[\s\S]{0,180}Consequential Action Gate[\s\S]{0,120}exact action manifest/i, "delegated gate/action manifest"],
]);
requires("builder", [
  [/direct and planner-driven builder prompts[\s\S]{0,180}Consequential Action Gate[\s\S]{0,80}exact action manifest/i, "direct/planner prompt propagation"],
]);

const production = [texts.system, texts.mirror, texts.heavy, texts.guide, texts.builder].join("\n");
assert.doesNotMatch(production, /\bUTM\b/i, "production contract must remain domain-neutral");
assert.doesNotMatch(
  production,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  "production contract must not hardcode incident UUIDs",
);

console.log("consequential-action-gate smoke: PASS");
