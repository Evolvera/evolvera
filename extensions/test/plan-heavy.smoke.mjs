import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDir, "../..");
const sandbox = mkdtempSync(path.join(tmpdir(), "plan-heavy-smoke-"));

function write(file, content) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function task({ id, target = "package.json", action = "MODIFY", recovery = "required", constraints = true, extraChange = "" }) {
  return `# Task ${id}

**Agent**: builder-heavy
**Why**: Shared-file integration correctness.
**Goal**: Apply one bounded change safely.

## Change
${extraChange ? `- \`${extraChange}\` — reference only; do not edit.\n` : ""}- \`${target}\` — ${action} — update one behavior used by \`demo()\`.

## Acceptance
- [ ] Existing behavior remains.
- [ ] New behavior is verified.
- [ ] Focused diff has no unrelated changes.
${constraints ? "\n## Constraints\n- Preserve unrelated declarations and ordering.\n" : ""}
## Validation
- \`npm run demo\` — passes.

## Checkpoint
- Recovery snapshot: ${recovery}.
- Commit scope: \`${target}\`.
`;
}

function validatorTask({ id }) {
  return `# Task ${id}

**Agent**: validator
**Why**: Independently gate a sensitive builder checkpoint.
**Goal**: Return an evidence-based PASS or BLOCKED verdict.

## Change
- Review only; do not modify production files.

## Acceptance
- [ ] The producer checkpoint and changed surface are identified.
- [ ] Risk-specific tests and diagnostics are checked.
- [ ] Verdict is exactly PASS or BLOCKED.

## Validation
- \`npm test\` — relevant checks pass.

## Checkpoint
- Recovery snapshot: not required.
- Checkpoint Commit: not required (quality gate).
`;
}

function plan(name, { rows, tasks, hazard = "package.json" }) {
  const dir = path.join(sandbox, name);
  write(path.join(dir, "HANDOFF.md"), `# Handoff\n\n## Shared File Hazards\n- \`${hazard}\` is shared.\n`);
  write(
    path.join(dir, "PLAN_FULL.md"),
    `# Plan\n\n## Shared File Hazards\n- \`${hazard}\` is shared.\n\n## Dirty File Policy\nSelective staging only.\n`,
  );
  write(
    path.join(dir, "SCHEDULE.md"),
    `# Schedule

| ID | Task File | Agent | Status | Dependencies | Parallel Group | Files Touched | Recovery Snapshot | Checkpoint Commit |
|---|---|---|---|---|---|---|---|---|
${rows.join("\n")}
`,
  );
  for (const [file, content] of Object.entries(tasks)) write(path.join(dir, "TASKS", file), content);
  return dir;
}

try {
  const typebox = path.join(root, "npm", "node_modules", "typebox");
  mkdirSync(path.join(sandbox, "node_modules"), { recursive: true });
  symlinkSync(typebox, path.join(sandbox, "node_modules", "typebox"), "dir");
  cpSync(path.join(root, "extensions", "plan-heavy.ts"), path.join(sandbox, "plan-heavy.ts"));

  const { default: extension } = await import(pathToFileURL(path.join(sandbox, "plan-heavy.ts")));
  const tools = new Map();
  extension({
    registerCommand() {},
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
    sendUserMessage() {},
  });

  const handoff = tools.get("plan_heavy_handoff");
  const validate = tools.get("plan_heavy_validate");
  const envelope = tools.get("plan_heavy_envelope");
  const ctx = { cwd: root };

  write(path.join(sandbox, ".pi", "plans", "stale-plan", "TASKS", "task_01_builder.md"), "# stale\n");
  const handoffResult = await handoff.execute(
    "test",
    { goal: "Protect the current surface", projectRoot: sandbox },
    undefined,
    undefined,
    { cwd: root },
  );
  assert.ok(path.isAbsolute(handoffResult.details.planDir), "planDir must be absolute");
  assert.ok(handoffResult.details.planDir.startsWith(sandbox), "planDir must live under projectRoot");
  const handoffPath = path.join(handoffResult.details.planDir, "HANDOFF.md");
  const generatedHandoff = readFileSync(handoffPath, "utf8");
  assert.match(generatedHandoff, /Historical `\.pi\/plans\/` files are intentionally omitted/);
  assert.doesNotMatch(generatedHandoff, /stale-plan|Existing plan files found/);

  async function expectValidation(dir, expected) {
    const result = await validate.execute("test", { planDir: dir }, undefined, undefined, ctx);
    assert.equal(result.details.ok, expected, result.content[0].text);
  }

  const kissAliases = path.join(sandbox, "kiss-aliases");
  write(path.join(kissAliases, "HANDOFF.md"), "# Handoff\n");
  write(path.join(kissAliases, "PLAN_FULL.md"), "# KISS Plan\n\nExact ownership lives in each task.\n");
  write(path.join(kissAliases, "SCHEDULE.md"), `# Schedule

| ID | Task | Agent | Status | Depends | Files touched | Snapshot | Gate / checkpoint |
|---|---|---|---|---|---|---|---|
| 01 | \`TASKS/task_01_builder-heavy.md\` | builder-heavy | pending | none | MODIFY \`package.json\`; CREATE \`src/new.ts\` | required | selective commit; Task 02 PASS |
| 02 | \`TASKS/task_02_validator.md\` | validator | pending | 01 | none | not required | PASS \\| BLOCKED |
`);
  write(path.join(kissAliases, "TASKS", "task_01_builder-heavy.md"), `# Apply bounded change

**Agent:** \`builder-heavy\`

## Change
- MODIFY \`package.json\` — preserve explanatory pattern \`/.htaccess\`.
- CREATE \`src/new.ts\`.

## Acceptance
- Focused behavior passes.

## Validation
- \`npm test\`.

## Checkpoint
Snapshot MODIFY under \`.pi/recovery/kiss/before/\`. Commit only declared paths.
`);
  write(path.join(kissAliases, "TASKS", "task_02_validator.md"), `# Review bounded change

**Agent:** \`validator\`

Read-only review of Task 01; no edits or commits.

## Acceptance
- Return PASS | BLOCKED with evidence.
`);
  await expectValidation(kissAliases, true);

  const minimalSchedule = path.join(sandbox, "minimal-schedule");
  write(path.join(minimalSchedule, "HANDOFF.md"), "# Handoff\n");
  write(path.join(minimalSchedule, "PLAN_FULL.md"), "# Plan\n");
  write(path.join(minimalSchedule, "SCHEDULE.md"), `| ID | Task | Agent | Depends | Gate |
|---|---|---|---|---|
| 01 | \`TASKS/task_01_builder-heavy.md\` | builder-heavy | none | selective commit |
`);
  write(path.join(minimalSchedule, "TASKS", "task_01_builder-heavy.md"), task({ id: "01", target: "src/new.ts", action: "CREATE", recovery: "not required", constraints: false }));
  await expectValidation(minimalSchedule, true);

  const orphanSchedule = path.join(sandbox, "orphan-schedule");
  write(path.join(orphanSchedule, "HANDOFF.md"), "# Handoff\n");
  write(path.join(orphanSchedule, "PLAN_FULL.md"), "# Plan\n");
  write(path.join(orphanSchedule, "SCHEDULE.md"), `| ID | Task | Agent | Depends |
|---|---|---|---|
| 01 | \`TASKS/task_01_builder.md\` | builder | none |
`);
  mkdirSync(path.join(orphanSchedule, "TASKS"), { recursive: true });
  await expectValidation(orphanSchedule, false);

  const duplicateTaskRow = path.join(sandbox, "duplicate-task-row");
  write(path.join(duplicateTaskRow, "HANDOFF.md"), "# Handoff\n");
  write(path.join(duplicateTaskRow, "PLAN_FULL.md"), "# Plan\n");
  write(path.join(duplicateTaskRow, "SCHEDULE.md"), `| ID | Task | Agent | Depends |
|---|---|---|---|
| 01 | \`TASKS/task_01_builder.md\` | builder | none |
| 02 | \`task_01_builder.md\` | builder | 01 |
`);
  write(path.join(duplicateTaskRow, "TASKS", "task_01_builder.md"), task({ id: "01", target: "src/new.ts", action: "CREATE", recovery: "not required", constraints: false }).replace("**Agent**: builder-heavy", "**Agent**: builder"));
  await expectValidation(duplicateTaskRow, false);

  const weakCommit = plan("weak-commit", {
    rows: ["| 01 | TASKS/task_01_builder-heavy.md | builder-heavy | pending | none | none | src/new.ts | not required | pending |"],
    tasks: { "task_01_builder-heavy.md": task({ id: "01", target: "src/new.ts", action: "CREATE", recovery: "not required", constraints: false }).replace("Commit scope: `src/new.ts`.", "Commit after tests.") },
    hazard: "none",
  });
  await expectValidation(weakCommit, false);

  const proseAction = plan("prose-action", {
    rows: ["| 01 | TASKS/task_01_builder-heavy.md | builder-heavy | pending | none | none | package.json | required | pending |"],
    tasks: { "task_01_builder-heavy.md": task({ id: "01" }).replace("- `package.json` — MODIFY — update one behavior used by `demo()`.", "- Preserve DELETE behavior described in `package.json`.") },
  });
  await expectValidation(proseAction, false);

  const leadingActionProse = plan("leading-action-prose", {
    rows: ["| 01 | TASKS/task_01_builder-heavy.md | builder-heavy | pending | none | none | package.json | required | pending |"],
    tasks: { "task_01_builder-heavy.md": task({ id: "01" }).replace("- `package.json` — MODIFY — update one behavior used by `demo()`.", "- MODIFY behavior described in `package.json`.") },
  });
  await expectValidation(leadingActionProse, false);

  const createOnly = plan("create-only", {
    rows: ["| 01 | TASKS/task_01_builder-heavy.md | builder-heavy | pending | none | none | src/new.ts | not required | pending |"],
    tasks: { "task_01_builder-heavy.md": task({ id: "01", target: "src/new.ts", action: "CREATE", recovery: "not required", constraints: false }) },
    hazard: "none",
  });
  await expectValidation(createOnly, true);

  const missingRecovery = plan("missing-recovery", {
    rows: ["| 01 | TASKS/task_01_builder-heavy.md | builder-heavy | pending | none | none | package.json | required | pending |"],
    tasks: { "task_01_builder-heavy.md": task({ id: "01", recovery: "not required" }) },
  });
  await expectValidation(missingRecovery, false);

  const linkedValidator = plan("linked-validator", {
    rows: [
      "| 01 | TASKS/task_01_builder-heavy.md | builder-heavy | pending | none | none | src/new.ts | not required | pending |",
      "| 02 | TASKS/task_02_validator.md | validator | pending | 01 | none | none | not required | not required (quality gate) |",
    ],
    tasks: {
      "task_01_builder-heavy.md": task({ id: "01", target: "src/new.ts", action: "CREATE", recovery: "not required", constraints: false }),
      "task_02_validator.md": validatorTask({ id: "02" }),
    },
    hazard: "none",
  });
  await expectValidation(linkedValidator, true);

  const unlinkedValidator = plan("unlinked-validator", {
    rows: ["| 01 | TASKS/task_01_validator.md | validator | pending | none | none | none | not required | not required (quality gate) |"],
    tasks: { "task_01_validator.md": validatorTask({ id: "01" }) },
    hazard: "none",
  });
  await expectValidation(unlinkedValidator, false);

  const unsafeOverlap = plan("unsafe-overlap", {
    rows: [
      "| 01 | TASKS/task_01_builder-heavy.md | builder-heavy | pending | none | P1 | package.json | required | pending |",
      "| 02 | TASKS/task_02_builder-heavy.md | builder-heavy | pending | none | P1 | ./package.json | required | pending |",
    ],
    tasks: {
      "task_01_builder-heavy.md": task({ id: "01" }),
      "task_02_builder-heavy.md": task({ id: "02", target: "./package.json" }),
    },
  });
  await expectValidation(unsafeOverlap, false);

  const safeOverlap = plan("safe-overlap", {
    rows: [
      "| 01 | TASKS/task_01_builder-heavy.md | builder-heavy | pending | none | none | package.json | required | pending |",
      "| 02 | TASKS/task_02_builder-heavy.md | builder-heavy | pending | 01 | none | ./package.json | required | pending |",
    ],
    tasks: {
      "task_01_builder-heavy.md": task({ id: "01", constraints: false }).replace("Commit scope:", "Preserve manifest anchors. Commit scope:"),
      "task_02_builder-heavy.md": task({ id: "02", target: "./package.json", constraints: false }).replace("Commit scope:", "Preserve manifest anchors. Commit scope:"),
    },
  });
  await expectValidation(safeOverlap, true);

  const scheduleMismatch = plan("schedule-mismatch", {
    rows: ["| 01 | TASKS/task_01_builder-heavy.md | builder-heavy | pending | none | none | package.json | required | pending |"],
    tasks: { "task_01_builder-heavy.md": task({ id: "01", target: "src/other.ts" }) },
  });
  await expectValidation(scheduleMismatch, true);

  const unsafeTaskPath = plan("unsafe-task-path", {
    rows: ["| 01 | TASKS/task_01_builder-heavy.md | builder-heavy | pending | none | none | package.json | required | pending |"],
    tasks: { "task_01_builder-heavy.md": task({ id: "01", target: "../../outside" }) },
  });
  await expectValidation(unsafeTaskPath, false);

  const unsafeWhitespacePath = plan("unsafe-whitespace-path", {
    rows: ["| 01 | TASKS/task_01_builder-heavy.md | builder-heavy | pending | none | none | ../../outside file | required | pending |"],
    tasks: { "task_01_builder-heavy.md": task({ id: "01", target: "../../outside file" }) },
  });
  await expectValidation(unsafeWhitespacePath, false);

  const unsafeSchedulePath = plan("unsafe-schedule-path", {
    rows: ["| 01 | TASKS/task_01_builder-heavy.md | builder-heavy | pending | none | none | /tmp/file | required | pending |"],
    tasks: { "task_01_builder-heavy.md": task({ id: "01" }) },
  });
  await expectValidation(unsafeSchedulePath, true);

  const urlReference = plan("url-reference", {
    rows: ["| 01 | TASKS/task_01_builder-heavy.md | builder-heavy | pending | none | none | package.json | required | pending |"],
    tasks: { "task_01_builder-heavy.md": task({ id: "01", extraChange: "https://example.com/schema" }) },
  });
  await expectValidation(urlReference, true);
  const urlEnvelope = await envelope.execute("test", { planDir: urlReference, task: "01" }, undefined, undefined, ctx);
  assert.doesNotMatch(urlEnvelope.content[0].text, /https:\/\/example\.com\/schema/);

  const envelopeResult = await envelope.execute("test", { planDir: safeOverlap, task: "02" }, undefined, undefined, ctx);
  assert.equal(envelopeResult.isError, undefined, envelopeResult.content[0].text);
  const envelopeText = readFileSync(envelopeResult.details.envelopePath.startsWith("/")
    ? envelopeResult.details.envelopePath
    : path.resolve(root, envelopeResult.details.envelopePath), "utf8");
  assert.match(envelopeText, /- `package\.json`/);
  assert.doesNotMatch(envelopeText, /- `\.\/package\.json`/);
  assert.doesNotMatch(envelopeText, /- `demo\(\)`/);

  console.log("plan-heavy smoke: PASS");
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
