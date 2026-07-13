import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, posix, relative } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const execFileAsync = promisify(execFile);

type CmdResult = { ok: boolean; stdout: string; stderr: string };

function normalizeArgs(args: unknown): string {
  return typeof args === "string" ? args.trim() : args == null ? "" : String(args).trim();
}

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return slug || "plan_heavy";
}

function timestampSlug(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").replace("T", "_");
}

async function run(cwd: string, command: string): Promise<CmdResult> {
  try {
    const { stdout, stderr } = await execFileAsync("bash", ["-lc", command], {
      cwd,
      timeout: 30_000,
      maxBuffer: 1024 * 1024 * 4,
    });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      stdout: (err.stdout ?? "").trim(),
      stderr: (err.stderr ?? err.message ?? String(error)).trim(),
    };
  }
}

function parseDirtyFiles(status: string): string[] {
  return status
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^..\s+/, ""))
    .map((line) => line.split(" -> ").pop() ?? line)
    .filter(Boolean);
}

async function fileLineCount(cwd: string, path: string): Promise<number | null> {
  const result = await run(cwd, `wc -l ${JSON.stringify(path)} 2>/dev/null | awk '{print $1}'`);
  const n = Number(result.stdout.trim());
  return Number.isFinite(n) ? n : null;
}

async function detectSharedHazards(cwd: string, dirtyFiles: string[]): Promise<string> {
  const hazards: string[] = [];

  for (const file of dirtyFiles.slice(0, 80)) {
    if (!existsSync(join(cwd, file))) continue;
    let reason = "";
    if (/(^|\/)tests?\//.test(file) || /(_test|\.test\.|\.spec\.)/.test(file)) reason = "test/corpus file";
    if (/\.rs$|\.ts$|\.tsx$|\.py$|\.go$|\.java$/.test(file)) {
      const lines = await fileLineCount(cwd, file);
      if (lines !== null && lines >= 800) reason = reason ? `${reason}; large file (${lines} lines)` : `large file (${lines} lines)`;
    }
    if (reason) hazards.push(`- \`${file}\` — ${reason}; classify preservation markers before builder tasks.`);
  }

  return hazards.length ? hazards.join("\n") : "- None detected by harness. Planner should still verify target-file hazards from task context.";
}

function ensureDir(path: string) {
  mkdirSync(path, { recursive: true });
}

function writeText(path: string, content: string) {
  ensureDir(dirname(path));
  writeFileSync(path, content, "utf8");
}

async function createHandoff(cwd: string, goal: string) {
  const slug = `${timestampSlug()}_${slugify(goal)}`;
  const planDir = join(cwd, ".pi", "plans", slug);
  ensureDir(join(planDir, "TASKS"));

  const [branch, log, status] = await Promise.all([
    run(cwd, "git branch --show-current 2>/dev/null || true"),
    run(cwd, "git log --oneline -5 2>/dev/null || true"),
    run(cwd, "git status --short 2>/dev/null || true"),
  ]);

  const dirtyFiles = parseDirtyFiles(status.stdout);
  const hazards = await detectSharedHazards(cwd, dirtyFiles);

  const handoff = `# Planner Heavy Handoff

Generated: ${new Date().toISOString()}
Plan Directory: \`${planDir}\`

<approved_goal>
${goal}
</approved_goal>

<repo_state>
- CWD: \`${cwd}\`
- Branch: ${branch.stdout || "UNKNOWN"}
- Recent commits:
\`\`\`text
${log.stdout || "NONE"}
\`\`\`
- Git status:
\`\`\`text
${status.stdout || "CLEAN"}
\`\`\`
</repo_state>

<dirty_files>
- Plan-owned dirty files: TO CLASSIFY BY ORCHESTRATOR/PLANNER
- Pre-existing dirty files NOT owned by this plan: TO CLASSIFY BEFORE COMMIT
- Unknown/dangerous dirty files:
${dirtyFiles.length ? dirtyFiles.map((f) => `  - \`${f}\``).join("\n") : "  - None"}
</dirty_files>

<prior_plan_context>
Historical \`.pi/plans/\` files are intentionally omitted to prevent unrelated scope from contaminating this plan. If the approved goal explicitly continues, repairs, or recovers a named prior plan, inspect only that named plan after confirming it is relevant.
</prior_plan_context>

<shared_file_hazards>
${hazards}
</shared_file_hazards>

<preservation_constraints>
- For every existing file that builders modify, create recovery snapshot before edit.
- For every large/shared file, identify markers/symbols/tests/helpers that must survive before editing.
- Do not include pre-existing dirty files in task commits unless explicitly owned by the plan.
</preservation_constraints>

<validation_and_checkpointing>
- Every MODIFY task requires recovery snapshot under \`.pi/recovery/{task_id}/before/...\`.
- Every task requires focused diff review before COMPLETE.
- Every verified writing task should be committed separately with selective staging only.
- Review-only validator gates record PASS/BLOCKED and do not create empty commits.
- SCHEDULE.md must record Recovery Snapshot and Checkpoint Commit or validator verdict semantics per task.
</validation_and_checkpointing>

<stop_rules>
- Block if dirty-file ownership is ambiguous for files a task must touch.
- Block if a task would modify a large/shared file without preservation markers.
- Block if safe validation cannot be defined for a correctness-sensitive change.
- Route high-risk bounded implementation to builder-heavy and assess whether a linked validator successor is warranted by consequence.
</stop_rules>
`;

  // Absolute paths only: briefers/planner run as separate sessions whose cwd
  // may differ from the orchestrator's; relative paths have already caused
  // plans to be read/written against the wrong base directory.
  const rel = (p: string) => join(planDir, p);
  const handoffRel = rel("HANDOFF.md");

  const briefGptPrompt = `PLAN-HEAVY BRIEF PHASE — GPT BRIEFER

You are \`plan-briefer\`, the GPT-5.6 Sol high briefer.

Read first:
- \`${handoffRel}\`

Goal:
${goal}

Write exactly one file:
- \`${rel("BRIEFS/brief_gpt.md")}\`

Produce one strategy brief only: logic, knowledge, decomposition approach, sequencing, risks, builder-routing intuition, and validation. NO task files, NO DAG, NO code.`;

  const briefFablePrompt = `PLAN-HEAVY BRIEF PHASE — FABLE BRIEFER

You are \`plan-briefer-fable\`, the Claude Fable 5 high briefer. Treat this run as Fable.

Read first:
- \`${handoffRel}\`

Goal:
${goal}

Write exactly one file:
- \`${rel("BRIEFS/brief_fable.md")}\`

Produce one strategy brief only: logic, knowledge, decomposition approach, sequencing, risks, builder-routing intuition, and validation. NO task files, NO DAG, NO code.`;

  const briefPrompt = `ORCHESTRATOR LAUNCH INSTRUCTIONS — DO NOT STOP AFTER HANDOFF.

The handoff tool/command only created files. Continue the ensemble automatically:

1. Launch TWO Agent calls in the SAME message with \`run_in_background: true\`:
   - \`subagent_type: "plan-briefer"\`, prompt file: \`${rel("BRIEFS/PROMPT_plan-briefer.md")}\`, output: \`${rel("BRIEFS/brief_gpt.md")}\`
   - \`subagent_type: "plan-briefer-fable"\`, prompt file: \`${rel("BRIEFS/PROMPT_plan-briefer-fable.md")}\`, output: \`${rel("BRIEFS/brief_fable.md")}\`
2. Wait for both briefers, then run \`plan-brief-merger\`.
3. Then run \`planner-heavy\`.
4. Then call \`plan_heavy_validate\`.

Normal flow uses Fable. If the Fable launch fails, stop and report the launch error so the orchestrator/user can choose a manual model override outside this prompt.`;

  const mergePrompt = `ENSEMBLE MERGE PHASE — run plan-brief-merger (GPT-5.6 Terra high).

- Read \`${rel("BRIEFS/brief_fable.md")}\` and \`${rel("BRIEFS/brief_gpt.md")}\` (and \`${handoffRel}\` for reference).
- Merge into \`${rel("BRIEFS/brief_merged.md")}\` per the plan-brief-merger system prompt: keep the strongest grounded reasoning from each, reconcile or flag disagreements, carry forward all TO VERIFY. NO task files, NO DAG.`;

  const prompt = `Use \`${handoffRel}\` as source of truth. If \`${rel("BRIEFS/brief_merged.md")}\` exists, read it first as strong strategy input.

Write the plan ecosystem into \`${planDir}\`:
- PLAN_FULL.md
- SCHEDULE.md
- TASKS/task_NN_<agent>.md

Preserve repo-state hazards, dirty-file exclusions, recovery requirements, and checkpoint commit policy from HANDOFF.md. Honor the merged brief's Unresolved Disagreements by deciding each explicitly. KISS means each builder gets a small, clear, independently verifiable outcome; task count is not capped. Every writing task must be intentionally shaped as one selective commit: it owns one implementation outcome, exact write set, validation result, and rollback boundary. Split only at real implementation, write-set, checkpoint, rollback, or validation boundaries. Give every matrix, safety rule, rollback procedure, and evidence package one owner; consumers reference that artifact/verdict instead of repeating it. Do not create builder tasks for PR creation, merge, CI waiting, board reconciliation, or branch cleanup unless the approved goal changes that tooling. Route normal-risk general work to builder, frontend/UI quality to builder-design, high-risk correctness/integration to builder-heavy, and exceptional visual craft beyond builder-design to builder-heavy-design. Use builder-highspeed for tiny explicit mechanical/module-local backend, tooling, test, or algorithm tasks; frontend highspeed work is limited to exact token/class/text swaps. For selected high-consequence or regression-prone builder tasks, add a separate \`task_NN_validator.md\` linked as the next SCHEDULE dependency; do not add blanket validator tasks, and use PASS/BLOCKED rather than an empty checkpoint commit for review-only gates. Keep task files compact: no TODO/TILL-DO templates, duplicated context, generic principle boilerplate, dependency prose, or N/A fields; builders and execution envelopes already own that process. If \`plan_heavy_validate\` returns BLOCKED, stop and report it; do not resume or reconcile the plan in a loop. After writing files, respond with the plan dir and next command: /plan-heavy validate ${planDir}.`;

  ensureDir(join(planDir, "BRIEFS"));
  writeText(join(planDir, "HANDOFF.md"), handoff);
  writeText(join(planDir, "PLAN_HEAVY_PROMPT.md"), prompt);
  writeText(join(planDir, "BRIEFS", "BRIEF_PROMPT.md"), briefPrompt);
  writeText(join(planDir, "BRIEFS", "PROMPT_plan-briefer.md"), briefGptPrompt);
  writeText(join(planDir, "BRIEFS", "PROMPT_plan-briefer-fable.md"), briefFablePrompt);
  writeText(join(planDir, "BRIEFS", "MERGE_PROMPT.md"), mergePrompt);

  return { planDir, handoff, prompt, briefPrompt, mergePrompt };
}

function readMaybe(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function listTaskFiles(planDir: string): string[] {
  const tasksDir = join(planDir, "TASKS");
  if (!existsSync(tasksDir)) return [];
  return readdirSync(tasksDir).filter((f) => f.endsWith(".md")).map((f) => join(tasksDir, f));
}

// Tolerant section extraction: finds a label as a heading (`## Label`, any level,
// with optional trailing suffix), a bold field (`**Label:**`), or a list field
// (`- **Label:**`). Separators in the label match space/hyphen/slash runs so
// "Files to Create / Modify" and "Shared-File Hazards" still match. Captures the
// block after the start line: for headings until the next heading; for fields
// until the next heading or first non-indented, non-blank line.
function extractSection(markdown: string, label: string): string {
  const words = label
    .trim()
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return "";
  const labelRe = words.join("[\\s/-]+");
  const startRe = new RegExp(`^\\s*(?:[-*>]\\s*)?(?:#{1,6}\\s*)?(?:\\*\\*)?\\s*${labelRe}\\b`, "i");
  const lines = markdown.split("\n");
  const startIdx = lines.findIndex((l) => startRe.test(l));
  if (startIdx < 0) return "";
  const isHeading = /^\s*#{1,6}\s/.test(lines[startIdx]);
  const out: string[] = [];
  for (let j = startIdx + 1; j < lines.length; j++) {
    const l = lines[j];
    if (/^\s*#{1,6}\s/.test(l)) break;
    if (!isHeading && l.trim() !== "" && /^\S/.test(l)) break;
    out.push(l);
  }
  return out.join("\n").trim();
}

function normalizeTargetPath(value: string): string | null {
  const normalized = posix.normalize(value.trim().replace(/\\/g, "/")).replace(/^\.\//, "");
  if (!normalized || normalized === "." || normalized.startsWith("../") || normalized.startsWith("/")) return null;
  return normalized;
}

function isPlausibleTargetPath(value: string): boolean {
  const candidate = value.trim();
  if (!candidate || /\s/.test(candidate) || /^[a-z][a-z0-9+.-]*:\/\//i.test(candidate) || /[(){}]/.test(candidate)) return false;
  const rootFile = /^(?:\.[A-Za-z0-9_-]+|[^/]+\.[A-Za-z0-9][A-Za-z0-9._-]*|Makefile|Dockerfile|LICENSE|README)$/i.test(candidate);
  return candidate.includes("/") || rootFile;
}

function keepTargetPath(value: string | null): value is string {
  if (!value) return false;
  return !value.startsWith(".pi/recovery/") && !value.startsWith(".pi/build/") && !value.includes("/EXECUTION_ENVELOPES/");
}

interface TargetParseResult {
  files: string[];
  invalid: string[];
}

function parseDeclaredTargets(values: string[]): TargetParseResult {
  const files = new Set<string>();
  const invalid = new Set<string>();
  for (const value of values.filter(isPlausibleTargetPath)) {
    const normalized = value.includes("*") ? null : normalizeTargetPath(value);
    if (!normalized || !keepTargetPath(normalized)) {
      invalid.add(value);
    } else {
      files.add(normalized);
    }
  }
  return { files: [...files], invalid: [...invalid] };
}

function declaredCodeTargets(line: string, requireAction: boolean): string[] {
  const statement = line.trim().replace(/^[-*]\s+/, "");
  const actionFirst = statement.match(/^(CREATE|MODIFY|DELETE|REMOVE|RENAME|MOVE)\b/i);
  if (actionFirst) {
    let declaration = statement.slice(actionFirst[0].length);
    if (!/^\s*`/.test(declaration)) return [];
    const proseBoundary = declaration.search(/\s(?:—|–)\s|:\s/);
    if (proseBoundary >= 0) declaration = declaration.slice(0, proseBoundary);
    return [...declaration.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
  }

  const pathFirst = statement.match(/^((?:`[^`]+`\s*(?:,\s*)?)+)\s*(?:—|–|-)\s*(?:CREATE|MODIFY|DELETE|REMOVE|RENAME|MOVE)\b/i);
  if (pathFirst) return [...pathFirst[1].matchAll(/`([^`]+)`/g)].map((match) => match[1]);
  if (requireAction) return [];
  return [...statement.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

function parseTaskChangeTargets(taskContent: string): TargetParseResult {
  const section = extractSection(taskContent, "Change");
  if (!section) return { files: [], invalid: [] };
  return parseDeclaredTargets(section.split("\n").flatMap((line) => declaredCodeTargets(line, true)));
}

function parseTaskTargets(taskContent: string): TargetParseResult {
  for (const label of ["Change", "Files Touched", "Files to Create / Modify", "Target Files", "Files to Modify"]) {
    const section = extractSection(taskContent, label);
    if (!section) continue;
    const requireAction = label === "Change";
    const parsed = parseDeclaredTargets(section.split("\n").flatMap((line) => declaredCodeTargets(line, requireAction)));
    if (parsed.files.length || parsed.invalid.length) return parsed;
  }
  return { files: [], invalid: [] };
}

function parseTargetFiles(taskContent: string): string[] {
  return parseTaskTargets(taskContent).files;
}

function findTaskFile(planDir: string, ref: string): string | null {
  const tasks = listTaskFiles(planDir);
  if (!ref) return null;
  const direct = ref.startsWith("/") ? ref : join(planDir, ref);
  if (existsSync(direct)) return direct;
  const normalized = ref.replace(/^task_/, "").replace(/^0+/, "");
  return (
    tasks.find((task) => relative(join(planDir, "TASKS"), task) === ref) ??
    tasks.find((task) => task.endsWith(ref)) ??
    tasks.find((task) => new RegExp(`task_0*${normalized}[_-]`).test(task)) ??
    null
  );
}

async function createExecutionEnvelope(cwd: string, planDir: string, taskRef: string): Promise<{ path: string; content: string }> {
  const taskPath = findTaskFile(planDir, taskRef);
  if (!taskPath) throw new Error(`Task not found in ${planDir}: ${taskRef}`);

  const taskContent = readMaybe(taskPath);
  const handoff = readMaybe(join(planDir, "HANDOFF.md"));
  const schedule = readMaybe(join(planDir, "SCHEDULE.md"));
  const status = await run(cwd, "git status --short 2>/dev/null || true");
  const branch = await run(cwd, "git branch --show-current 2>/dev/null || true");
  const log = await run(cwd, "git log --oneline -5 2>/dev/null || true");
  const targetFiles = parseTargetFiles(taskContent);
  const taskBase = relative(join(planDir, "TASKS"), taskPath).replace(/\.md$/, "");
  const envelopePath = join(planDir, "EXECUTION_ENVELOPES", `${taskBase}_EXECUTION_ENVELOPE.md`);
  const snapshotDir = join(".pi", "recovery", taskBase, "before");

  const lineCounts: string[] = [];
  for (const file of targetFiles) {
    const abs = join(cwd, file);
    if (!existsSync(abs)) continue;
    const count = await fileLineCount(cwd, file);
    lineCounts.push(`- \`${file}\`: ${count ?? "unknown"} lines`);
  }

  const content = `# Execution Envelope — ${taskBase}

Generated: ${new Date().toISOString()}
Plan Directory: \`${planDir}\`
Task File: \`${taskPath}\`

## Runtime Repo State
- Branch: ${branch.stdout || "UNKNOWN"}
- Recent commits:
\`\`\`text
${log.stdout || "NONE"}
\`\`\`
- Git status before task:
\`\`\`text
${status.stdout || "CLEAN"}
\`\`\`

## Task Target Files
${targetFiles.length ? targetFiles.map((f) => `- \`${f}\``).join("\n") : "- TO VERIFY: no target files parsed from task"}

## Current Target File Line Counts
${lineCounts.length ? lineCounts.join("\n") : "- None / new files only / not found"}

## Recovery Snapshot Directory
\`${snapshotDir}\`

## Task Constraints / Patch Anchors
${extractSection(taskContent, "Patch Anchors") || extractSection(taskContent, "Constraints") || extractSection(taskContent, "Patch Boundaries") || "- No task-specific anchors found; use target-file scope and stop on ambiguity."}

## Acceptance / Preservation Signals
${extractSection(taskContent, "Acceptance") || extractSection(taskContent, "Preservation Markers") || extractSection(taskContent, "Success Criteria") || "- Follow the task Goal/Change contract and stop if it cannot be verified."}

## Dirty File Rules
- Stage/commit only files listed in this task plus relevant \`.pi/build\` and \`.pi/recovery\` artifacts.
- Do not stage pre-existing dirty files from the status block unless the task explicitly owns them.
- If a target file has pre-existing unrelated dirty hunks, use anchored edits and selective staging.

## Validation / Checkpoint Rules
- Run the task Validation checks.
- Enforce task-specific Constraints/Patch Anchors and Acceptance signals when present.
- Review focused diff for target files only.
- If complete, orchestrator creates one selective checkpoint commit and records it in SCHEDULE.md.

## Handoff Excerpt
\`\`\`markdown
${handoff.slice(0, 8000) || "HANDOFF.md not found"}
\`\`\`

## Schedule Excerpt
\`\`\`markdown
${schedule.slice(0, 8000) || "SCHEDULE.md not found"}
\`\`\`
`;

  writeText(envelopePath, content);
  return { path: envelopePath, content };
}

// Tolerant field/section detection: matches a label as a heading (`## Label`),
// bold (`**Label**`, `**Label:**`, `**Label**:`), or list field (`- **Label:**`),
// case-insensitive, so valid formatting variants are not rejected.
function hasLabel(content: string, label: string): boolean {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s-]+");
  const re = new RegExp(`(^|\\n)\\s*(?:[-*>]\\s*)?(?:#{1,6}\\s*)?(?:\\*\\*)?\\s*${esc}\\s*:?\\s*(?:\\*\\*)?\\s*:?`, "i");
  return re.test(content);
}

function hasAnyLabel(content: string, labels: string[]): boolean {
  return labels.some((label) => hasLabel(content, label));
}

interface ScheduleTaskRow {
  id: string;
  taskFile: string;
  agent: string;
  dependencies: string;
  parallelGroup: string;
  checkpointCommit: string;
  recoverySnapshot: string;
  filesTouched: string[];
  invalidTargets: string[];
}

function parseScheduleTargets(value: string): TargetParseResult {
  const codeTargets = [...value.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
  if (codeTargets.length) return parseDeclaredTargets(codeTargets);
  const bareTargets = value
    .split(/\s*(?:,|;|<br\s*\/?>)\s*/i)
    .map((candidate) => candidate.replace(/^(?:CREATE|MODIFY|DELETE|REMOVE|RENAME|MOVE)\s+/i, "").trim())
    .filter((candidate) => !/^(?:none|n\/a|na|—|-)$/i.test(candidate));
  return parseDeclaredTargets(bareTargets);
}

function parseScheduleTaskRows(schedule: string): ScheduleTaskRow[] {
  const lines = schedule.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*\|/.test(lines[i])) continue;
    const headers = lines[i].split("|").slice(1, -1).map((cell) => cell.trim().toLowerCase());
    const idIndex = headers.indexOf("id");
    const taskIndex = headers.findIndex((header) => header === "task" || header.includes("task file"));
    const agentIndex = headers.indexOf("agent");
    const depsIndex = headers.findIndex((header) => header.includes("depend"));
    const groupIndex = headers.findIndex((header) => header.includes("parallel group"));
    const filesIndex = headers.findIndex((header) => header.includes("files touched"));
    const checkpointIndex = headers.findIndex((header) => header.includes("checkpoint") || header === "gate");
    const snapshotIndex = headers.findIndex((header) => header.includes("recovery snapshot") || header === "snapshot");
    if (idIndex < 0 || taskIndex < 0 || agentIndex < 0 || depsIndex < 0) continue;

    const rows: ScheduleTaskRow[] = [];
    for (let j = i + 2; j < lines.length && /^\s*\|/.test(lines[j]); j++) {
      const cells = lines[j].split("|").slice(1, -1).map((cell) => cell.trim().replace(/`/g, ""));
      if (!cells[idIndex] || /^[-:]+$/.test(cells[idIndex])) continue;
      const targets = filesIndex >= 0 ? parseScheduleTargets(cells[filesIndex] ?? "") : { files: [], invalid: [] };
      rows.push({
        id: cells[idIndex],
        taskFile: cells[taskIndex] ?? "",
        agent: cells[agentIndex] ?? "",
        dependencies: cells[depsIndex] ?? "",
        parallelGroup: groupIndex >= 0 ? cells[groupIndex] ?? "" : "",
        checkpointCommit: checkpointIndex >= 0 ? cells[checkpointIndex] ?? "" : "",
        recoverySnapshot: snapshotIndex >= 0 ? cells[snapshotIndex] ?? "" : "",
        filesTouched: targets.files,
        invalidTargets: targets.invalid,
      });
    }
    return rows;
  }
  return [];
}

function isActiveParallelGroup(value: string): boolean {
  return Boolean(value) && !/^(?:none|n\/a|na|—|-)$/i.test(value.trim());
}

function declaredAgent(taskContent: string): string {
  return taskContent.match(/\*\*Agent\*\*\s*:\s*([a-z0-9-]+)/i)?.[1]?.toLowerCase() ?? "";
}

function hasPassBlockedContract(value: string): boolean {
  const normalized = value.replace(/[`*_]/g, "");
  return /PASS\s*(?:\\?\||or)\s*BLOCKED/i.test(normalized);
}

function dependencyIds(value: string): string[] {
  if (!value || /^(?:none|n\/a|na|—|-)$/i.test(value.trim())) return [];
  return [...value.matchAll(/\b0*(\d+)\b/g)].map((match) => match[1]);
}

function scheduleDependsOn(sourceId: string, targetId: string, rows: ScheduleTaskRow[], seen = new Set<string>()): boolean {
  const source = String(Number(sourceId));
  const target = String(Number(targetId));
  if (source === target || seen.has(source)) return source === target;
  seen.add(source);
  const row = rows.find((candidate) => String(Number(candidate.id)) === source);
  if (!row) return false;
  return dependencyIds(row.dependencies).some((dependency) => {
    const normalized = String(Number(dependency));
    return normalized === target || scheduleDependsOn(normalized, target, rows, seen);
  });
}

function validatePlan(planDir: string): { ok: boolean; report: string } {
  const required = ["HANDOFF.md", "PLAN_FULL.md", "SCHEDULE.md"];
  const missing = required.filter((f) => !existsSync(join(planDir, f)));
  const schedule = readMaybe(join(planDir, "SCHEDULE.md"));
  const plan = readMaybe(join(planDir, "PLAN_FULL.md"));
  const handoff = readMaybe(join(planDir, "HANDOFF.md"));
  const tasks = listTaskFiles(planDir);
  const scheduleRows = parseScheduleTaskRows(schedule);
  const findings: string[] = [];

  for (const file of missing) findings.push(`BLOCKER: missing ${file}`);
  if (!existsSync(join(planDir, "TASKS"))) findings.push("BLOCKER: missing TASKS/ directory");
  if (schedule && scheduleRows.length === 0) findings.push("BLOCKER: SCHEDULE.md has no parseable task table");
  if (!hasLabel(plan, "Shared File Hazards")) findings.push("WARN: PLAN_FULL.md has no Shared File Hazards section; acceptable when target ownership and serialization are explicit elsewhere");
  if (!/dirty/i.test(plan + schedule)) findings.push("WARN: dirty-file handling not mentioned in plan/schedule");

  const sharedHazardText = `${extractSection(plan, "Shared File Hazards")}\n${extractSection(handoff, "Shared File Hazards")}`.toLowerCase();
  const validAgents = new Set(["builder-highspeed", "builder", "builder-design", "builder-heavy", "builder-ultra", "builder-heavy-design", "validator"]);
  const taskRecords: Array<{
    name: string;
    content: string;
    agent: string;
    compact: boolean;
    targets: string[];
    modifies: boolean;
    schedule?: ScheduleTaskRow;
  }> = [];

  for (const task of tasks) {
    const content = readMaybe(task);
    const name = relative(planDir, task);
    const agent = declaredAgent(content);
    const isValidator = agent === "validator";
    const compact = hasLabel(content, "Change");
    const parsedTaskTargets = parseTaskChangeTargets(content);
    const taskTargets = parsedTaskTargets.files;
    const change = extractSection(content, "Change");
    const modifies = change.split("\n").some((line) => /`[^`]+`/.test(line) && /\b(?:MODIFY|DELETE|REMOVE|RENAME|MOVE)\b/i.test(line));
    const taskBase = name.split("/").pop() ?? name;
    const scheduleRow = scheduleRows.find((row) => row.taskFile.endsWith(taskBase));
    const scheduleTargets = scheduleRow?.filesTouched ?? [];
    const targets = taskTargets.length ? taskTargets : scheduleTargets;

    if (!validAgents.has(agent)) findings.push(`BLOCKER: ${name} declares unsupported Agent ${agent || "<missing>"}`);
    if (isValidator) {
      if (!hasAnyLabel(content, ["Acceptance", "Success Criteria"])) findings.push(`BLOCKER: ${name} validator task missing Acceptance/Success Criteria`);
      if (!hasPassBlockedContract(content)) findings.push(`BLOCKER: ${name} validator task must define PASS | BLOCKED`);
    } else {
      const requiredGroups: Array<[string, string[]]> = [
        ["Change", ["Change"]],
        ["Acceptance", ["Acceptance", "Success Criteria"]],
        ["Validation", ["Validation", "Verification", "Mandatory order"]],
        ["Checkpoint", ["Checkpoint"]],
      ];
      for (const [display, aliases] of requiredGroups) {
        if (!hasAnyLabel(content, aliases)) findings.push(`BLOCKER: ${name} missing ${display}`);
      }
      if (!taskTargets.length) findings.push(`BLOCKER: ${name} writing task declares no exact target path in its change section`);
      const checkpoint = extractSection(content, "Checkpoint");
      const selectiveCommit = /(?:\b(?:one|single|selective)\b[^\n]*\bcommit\b|\bcommit\b[^\n]*\b(?:only|exact|declared|scope)\b)/i.test(checkpoint);
      if (checkpoint && !selectiveCommit) findings.push(`BLOCKER: ${name} Checkpoint must define one selective commit boundary`);
      if (modifies) {
        const taskRejectsRecovery = /(?:recovery snapshot|snapshot|recovery)\s*:\s*(?:not required|none|no|n\/a)/i.test(checkpoint);
        const recoveryEvidence = `${checkpoint}\n${scheduleRow?.recoverySnapshot ?? ""}`;
        const hasRecovery = /(?:snapshot|\.pi\/recovery\/|\brecovery\b)/i.test(recoveryEvidence);
        if (taskRejectsRecovery || !hasRecovery) findings.push(`BLOCKER: ${name} MODIFY/DELETE task must define recovery or snapshot evidence`);
      }
    }

    for (const target of parsedTaskTargets.invalid) {
      findings.push(`BLOCKER: ${name} declares unsafe target path ${target}`);
    }
    if (scheduleRow?.invalidTargets.length) {
      findings.push(`WARN: SCHEDULE row ${scheduleRow.id} contains a non-canonical or unsafe target summary; task Change remains write-set authority`);
    }
    const expectedSuffix = agent ? `_${agent}.md` : "";
    if (expectedSuffix && !name.endsWith(expectedSuffix)) findings.push(`BLOCKER: ${name} filename does not match Agent ${agent}`);
    if (!scheduleRow) {
      findings.push(`BLOCKER: ${name} has no matching SCHEDULE row`);
    } else {
      if (scheduleRow.agent.toLowerCase() !== agent) {
        findings.push(`BLOCKER: ${name} Agent ${agent || "<missing>"} does not match SCHEDULE Agent ${scheduleRow.agent || "<missing>"}`);
      }
      const scheduleOnly = scheduleTargets.filter((file) => !taskTargets.includes(file));
      const taskOnly = taskTargets.filter((file) => !scheduleTargets.includes(file));
      if (taskTargets.length && scheduleTargets.length && (scheduleOnly.length || taskOnly.length)) {
        findings.push(`WARN: ${name} exact task targets differ from the SCHEDULE summary; task Change remains write-set authority`);
      }
    }

    const declaredHazard = targets.some((file) => {
      const normalized = file.toLowerCase();
      const base = normalized.split("/").pop() ?? normalized;
      return sharedHazardText.includes(normalized) || (base.length > 3 && sharedHazardText.includes(base));
    });
    if (!isValidator && modifies && declaredHazard && !hasLabel(content, "Constraints") && !hasLabel(content, "Patch Anchors")) {
      findings.push(`BLOCKER: ${name} modifies a declared shared-file hazard but has no Constraints or Patch Anchors`);
    }

    const lines = content.split("\n").length;
    if (lines > 180) findings.push(`WARN: ${name} has ${lines} lines; verify every extra detail changes execution`);
    taskRecords.push({ name, content, agent, compact, targets, modifies, schedule: scheduleRow });
  }

  const seenScheduleIds = new Set<string>();
  const seenScheduleTasks = new Set<string>();
  for (const row of scheduleRows) {
    const normalizedId = String(Number(row.id));
    if (seenScheduleIds.has(normalizedId)) findings.push(`BLOCKER: SCHEDULE has duplicate task ID ${row.id}`);
    seenScheduleIds.add(normalizedId);
    const normalizedTaskRef = row.taskFile.replace(/^\.\//, "");
    const taskBase = normalizedTaskRef.split("/").pop() ?? normalizedTaskRef;
    const matchedTask = tasks.find((task) => task.endsWith(taskBase));
    const canonicalTaskRef = matchedTask ? relative(planDir, matchedTask) : normalizedTaskRef;
    if (seenScheduleTasks.has(canonicalTaskRef)) findings.push(`BLOCKER: SCHEDULE references task file ${row.taskFile} more than once`);
    seenScheduleTasks.add(canonicalTaskRef);
    if (!matchedTask) findings.push(`BLOCKER: SCHEDULE row ${row.id} references missing task file ${row.taskFile || "<missing>"}`);
  }

  for (const record of taskRecords.filter((task) => task.agent === "validator")) {
    if (!record.schedule) continue;
    const deps = dependencyIds(record.schedule.dependencies);
    const dependencyRows = deps.map((id) => scheduleRows.find((row) => Number(row.id) === Number(id))).filter((row): row is ScheduleTaskRow => Boolean(row));
    if (!deps.length) findings.push(`BLOCKER: ${record.name} validator gate has no builder dependency`);
    if (deps.some((id) => !scheduleRows.some((row) => Number(row.id) === Number(id)))) {
      findings.push(`BLOCKER: ${record.name} validator gate references an unknown dependency`);
    }
    if (deps.length && !dependencyRows.some((row) => row.agent.toLowerCase().startsWith("builder"))) {
      findings.push(`BLOCKER: ${record.name} validator gate is not linked to a builder task`);
    }
    if (!record.targets.length) {
      const checkpoint = extractSection(record.content, "Checkpoint");
      const noCommitEvidence = /(?:read-only|review-only|no edits|no commits|checkpoint commit\s*:\s*not required)/i.test(`${record.content}\n${checkpoint}`);
      const scheduleVerdict = /not required/i.test(record.schedule.checkpointCommit) || hasPassBlockedContract(record.schedule.checkpointCommit);
      if (!noCommitEvidence && !scheduleVerdict) {
        findings.push(`BLOCKER: ${record.name} review-only validator must state no commit or use a PASS | BLOCKED schedule gate`);
      }
    }
  }

  const targetOwners = new Map<string, typeof taskRecords>();
  for (const record of taskRecords) {
    for (const target of record.targets) {
      const owners = targetOwners.get(target) ?? [];
      owners.push(record);
      targetOwners.set(target, owners);
    }
  }
  for (const [target, owners] of targetOwners) {
    if (owners.length < 2) continue;
    for (let i = 0; i < owners.length; i++) {
      for (let j = i + 1; j < owners.length; j++) {
        const a = owners[i];
        const b = owners[j];
        if (!a.schedule || !b.schedule) {
          findings.push(`BLOCKER: overlapping target ${target} cannot be checked because a SCHEDULE row is missing for ${a.name} or ${b.name}`);
          continue;
        }
        const sameParallelGroup = isActiveParallelGroup(a.schedule.parallelGroup) && a.schedule.parallelGroup === b.schedule.parallelGroup;
        if (sameParallelGroup) {
          findings.push(`BLOCKER: overlapping target ${target} is assigned to parallel group ${a.schedule.parallelGroup} in ${a.name} and ${b.name}`);
        }
        const aDependsOnB = scheduleDependsOn(a.schedule.id, b.schedule.id, scheduleRows);
        const bDependsOnA = scheduleDependsOn(b.schedule.id, a.schedule.id, scheduleRows);
        if (!aDependsOnB && !bDependsOnA) {
          findings.push(`BLOCKER: overlapping target ${target} is not serialized by an explicit dependency between ${a.name} and ${b.name}`);
        }
        for (const record of [a, b]) {
          if (record.compact && record.modifies && !hasLabel(record.content, "Constraints") && !hasLabel(record.content, "Patch Anchors")) {
            findings.push(`BLOCKER: ${record.name} overlaps on ${target} but has no Constraints or Patch Anchors`);
          }
        }
      }
    }
  }

  const blockers = findings.filter((f) => f.startsWith("BLOCKER"));
  const ok = blockers.length === 0;
  const report = `# Plan Heavy Validation

Generated: ${new Date().toISOString()}
Plan Directory: \`${planDir}\`
Status: ${ok ? "PASS" : "BLOCKED"}

## Findings
${findings.length ? findings.map((f) => `- ${f}`).join("\n") : "- No issues found."}

## Task Files
${tasks.length ? tasks.map((t) => `- \`${relative(planDir, t)}\``).join("\n") : "- None"}
`;
  writeText(join(planDir, "PLAN_HEAVY_VALIDATION.md"), report);
  return { ok, report };
}

export default function planHeavyExtension(pi: ExtensionAPI) {
  pi.registerCommand("plan-heavy", {
    description: "Create/validate/envelope a harness-grounded heavy plan. Usage: /plan-heavy <goal>, /plan-heavy validate <plan-dir>, /plan-heavy envelope <plan-dir> <task-id|task-file>",
    handler: async (args, ctx) => {
      const raw = normalizeArgs(args);
      if (!raw) {
        ctx.ui.notify("Usage: /plan-heavy <goal>, /plan-heavy validate <plan-dir>, or /plan-heavy envelope <plan-dir> <task-id|task-file>", "warning");
        return;
      }

      if (raw.startsWith("envelope ")) {
        const rest = raw.slice("envelope ".length).trim();
        const [planPath, taskRef] = rest.split(/\s+/, 2);
        if (!planPath || !taskRef) {
          ctx.ui.notify("Usage: /plan-heavy envelope <plan-dir> <task-id|task-file>", "warning");
          return;
        }
        const planDir = planPath.startsWith("/") ? planPath : join(ctx.cwd, planPath);
        if (!existsSync(planDir) || !statSync(planDir).isDirectory()) {
          ctx.ui.notify(`Plan directory not found: ${planPath}`, "error");
          return;
        }
        try {
          const envelope = await createExecutionEnvelope(ctx.cwd, planDir, taskRef);
          ctx.ui.notify(`Execution envelope created: ${relative(ctx.cwd, envelope.path)}`, "info");
          ctx.ui.setEditorText(envelope.content);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          ctx.ui.notify(`Envelope failed: ${message}`, "error");
        }
        return;
      }

      if (raw.startsWith("validate ")) {
        const planPath = raw.slice("validate ".length).trim();
        const planDir = planPath.startsWith("/") ? planPath : join(ctx.cwd, planPath);
        if (!existsSync(planDir) || !statSync(planDir).isDirectory()) {
          ctx.ui.notify(`Plan directory not found: ${planPath}`, "error");
          return;
        }
        const result = validatePlan(planDir);
        ctx.ui.notify(result.ok ? "Plan-heavy validation PASS" : "Plan-heavy validation BLOCKED", result.ok ? "info" : "warning");
        ctx.ui.setEditorText(result.report);
        return;
      }

      const { planDir, prompt, briefPrompt, mergePrompt } = await createHandoff(ctx.cwd, raw);
      const relativePlanDir = relative(ctx.cwd, planDir);
      ctx.ui.notify(`Plan-heavy handoff created: ${relativePlanDir}`, "info");
      const flow = `Plan-heavy ensemble flow (5 phases):\n\nIMPORTANT: handoff creation is not completion. Do not answer the user yet; continue by launching the agents below.\n\n1) BRIEFS (parallel) — plan-briefer + plan-briefer-fable:\n${briefPrompt}\n\n2) MERGE — plan-brief-merger:\n${mergePrompt}\n\n3) PLAN — planner-heavy:\n${prompt}\n\n4) plan_heavy_validate → 5) plan_heavy_envelope per task → builders.`;
      ctx.ui.setEditorText(flow);

      if (ctx.isIdle()) {
        pi.sendUserMessage(`Plan-heavy handoff is ready at \`${relativePlanDir}/HANDOFF.md\`, but this is not done. Continue now: launch \`plan-briefer\` and \`plan-briefer-fable\` in parallel using the prompt files under \`${relativePlanDir}/BRIEFS/\`; then run \`plan-brief-merger\`, \`planner-heavy\`, and \`plan_heavy_validate\`.\n\n${flow}`);
      }
    },
  });

  // Agent-callable tools (same deterministic logic as the slash command).
  // These let the orchestrating agent run the harness directly instead of
  // depending on a human typing the slash command.
  pi.registerTool({
    name: "plan_heavy_handoff",
    label: "Plan Heavy: Handoff",
    description:
      "Deterministically collect current repo state (branch, recent commits, git status, dirty files, shared-file hazards) and create a planner-heavy handoff for the ensemble flow. Historical plans are omitted unless the approved goal explicitly names one. " +
      "Creates .pi/plans/<slug>/HANDOFF.md, PLAN_HEAVY_PROMPT.md, and BRIEFS/ prompts. Returns explicit instructions to continue by launching plan-briefer and plan-briefer-fable in parallel, then plan-brief-merger, planner-heavy, and plan_heavy_validate. Use before planning high-risk/long-horizon work.",
    promptSnippet: "Use plan_heavy_handoff to start /plan-heavy, then do not stop: launch plan-briefer + plan-briefer-fable in parallel, merge, plan, and validate.",
    parameters: Type.Object({
      goal: Type.String({ description: "Approved goal/scope for the heavy plan." }),
      projectRoot: Type.String({
        description:
          "Absolute repository root that owns the change (resolve with `git -C <path> rev-parse --show-toplevel`). The plan is created under <projectRoot>/.pi/plans/; never derived from the session cwd.",
      }),
    }),
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      try {
        const root = params.projectRoot?.trim();
        if (!root || !isAbsolute(root)) {
          throw new Error("projectRoot must be an absolute path to the repository that owns the change.");
        }
        if (!existsSync(root) || !statSync(root).isDirectory()) {
          throw new Error(`projectRoot does not exist or is not a directory: ${root}`);
        }
        const { planDir, prompt, briefPrompt, mergePrompt } = await createHandoff(root, params.goal);
        return {
          content: [
            {
              type: "text",
              text:
                `Plan-heavy handoff created at \`${planDir}\`.\n\n` +
                `IMPORTANT: this tool only created the handoff. Do not stop or answer the user yet. Immediately continue the ensemble, then call plan_heavy_validate.\n\n` +
                `=== PHASE 1: BRIEFS (launch plan-briefer + plan-briefer-fable in parallel) ===\n${briefPrompt}\n\n` +
                `Prompt files:\n- \`${planDir}/BRIEFS/PROMPT_plan-briefer.md\`\n- \`${planDir}/BRIEFS/PROMPT_plan-briefer-fable.md\`\n\n` +
                `=== PHASE 2: MERGE (launch plan-brief-merger) ===\n${mergePrompt}\n\n` +
                `=== PHASE 3: PLAN (launch planner-heavy) ===\n${prompt}`,
            },
          ],
          details: { planDir },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: `plan_heavy_handoff failed: ${message}` }], isError: true, details: { error: message } };
      }
    },
  });

  pi.registerTool({
    name: "plan_heavy_envelope",
    label: "Plan Heavy: Envelope",
    description:
      "Create an execution envelope for one planner-heavy task. Captures current git status, target files, line counts, task constraints/anchors, acceptance signals, snapshot dir, and checkpoint rules. " +
      "Pass both the task file and this envelope to the builder before execution.",
    promptSnippet: "Use plan_heavy_envelope before spawning a builder for a /plan-heavy task.",
    parameters: Type.Object({
      planDir: Type.String({ description: "Plan directory (absolute or relative to cwd)." }),
      task: Type.String({ description: "Task id (e.g. 01), task file name, or TASKS/ path." }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const planDir = params.planDir.startsWith("/") ? params.planDir : join(ctx.cwd, params.planDir);
      if (!existsSync(planDir) || !statSync(planDir).isDirectory()) {
        return { content: [{ type: "text", text: `Plan directory not found: ${params.planDir}` }], isError: true, details: { error: "missing_plan_dir" } };
      }
      try {
        const envelope = await createExecutionEnvelope(ctx.cwd, planDir, params.task);
        return {
          content: [
            { type: "text", text: `Execution envelope created: \`${relative(ctx.cwd, envelope.path)}\`\n\n${envelope.content}` },
          ],
          details: { envelopePath: relative(ctx.cwd, envelope.path) },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: `plan_heavy_envelope failed: ${message}` }], isError: true, details: { error: message } };
      }
    },
  });

  pi.registerTool({
    name: "plan_heavy_validate",
    label: "Plan Heavy: Validate",
    description:
      "Validate a generated plan ecosystem (HANDOFF/PLAN_FULL/SCHEDULE/TASKS) for checkpoint commits, recovery snapshots, shared-file hazards, agent routing, compact task contracts, validation, and task-specific constraints. Supports compact and legacy task formats. Writes PLAN_HEAVY_VALIDATION.md and returns PASS/BLOCKED.",
    promptSnippet: "Use plan_heavy_validate after planner-heavy writes the plan and before spawning builders.",
    parameters: Type.Object({
      planDir: Type.String({ description: "Plan directory (absolute or relative to cwd)." }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const planDir = params.planDir.startsWith("/") ? params.planDir : join(ctx.cwd, params.planDir);
      if (!existsSync(planDir) || !statSync(planDir).isDirectory()) {
        return { content: [{ type: "text", text: `Plan directory not found: ${params.planDir}` }], isError: true, details: { error: "missing_plan_dir" } };
      }
      const result = validatePlan(planDir);
      return {
        content: [{ type: "text", text: result.report }],
        isError: !result.ok,
        details: { ok: result.ok },
      };
    },
  });

  console.log("[plan-heavy] Extension loaded: /plan-heavy command + plan_heavy_* tools enabled");
}
