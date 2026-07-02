import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
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

  const existingSchedules = await run(
    cwd,
    "find .pi/plans -name SCHEDULE.md -type f -maxdepth 4 2>/dev/null | sort | tail -20",
  );
  if (existingSchedules.stdout) {
    hazards.push("- Existing schedules found; inspect prior task/file ownership before planning new work.");
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

  const [branch, log, status, plans] = await Promise.all([
    run(cwd, "git branch --show-current 2>/dev/null || true"),
    run(cwd, "git log --oneline -5 2>/dev/null || true"),
    run(cwd, "git status --short 2>/dev/null || true"),
    run(cwd, "find .pi/plans -maxdepth 3 -type f 2>/dev/null | sort | tail -200"),
  ]);

  const dirtyFiles = parseDirtyFiles(status.stdout);
  const hazards = await detectSharedHazards(cwd, dirtyFiles);

  const handoff = `# Planner Heavy Handoff

Generated: ${new Date().toISOString()}
Plan Directory: \`${relative(cwd, planDir)}\`

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

<active_plan_state>
Existing plan files found:
\`\`\`text
${plans.stdout || "NONE"}
\`\`\`
Completed tasks + checkpoint commits: TO VERIFY FROM EXISTING SCHEDULES IF CONTINUING WORK
Blocked/error tasks: TO VERIFY FROM EXISTING SCHEDULES IF CONTINUING WORK
Files touched by prior tasks: TO VERIFY FROM EXISTING SCHEDULES IF CONTINUING WORK
</active_plan_state>

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
- Every verified task should be committed separately with selective staging only.
- SCHEDULE.md must record Recovery Snapshot and Checkpoint Commit per task.
</validation_and_checkpointing>

<stop_rules>
- Block if dirty-file ownership is ambiguous for files a task must touch.
- Block if a task would modify a large/shared file without preservation markers.
- Block if safe validation cannot be defined for a correctness-sensitive change.
- Route high-risk bounded tasks to builder-heavy.
</stop_rules>
`;

  const rel = (p: string) => relative(cwd, join(planDir, p));
  const handoffRel = rel("HANDOFF.md");

  const briefGptPrompt = `PLAN-HEAVY BRIEF PHASE — GPT BRIEFER

You are \`plan-briefer\`.

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

  const mergePrompt = `ENSEMBLE MERGE PHASE — run plan-brief-merger (GPT-5.5 high).

- Read \`${rel("BRIEFS/brief_fable.md")}\` and \`${rel("BRIEFS/brief_gpt.md")}\` (and \`${handoffRel}\` for reference).
- Merge into \`${rel("BRIEFS/brief_merged.md")}\` per the plan-brief-merger system prompt: keep the strongest grounded reasoning from each, reconcile or flag disagreements, carry forward all TO VERIFY. NO task files, NO DAG.`;

  const prompt = `Use \`${handoffRel}\` as source of truth. If \`${rel("BRIEFS/brief_merged.md")}\` exists, read it first as strong strategy input.

Write the plan ecosystem into \`${relative(cwd, planDir)}\`:
- PLAN_FULL.md
- SCHEDULE.md
- TASKS/task_NN_<agent>.md

Preserve repo-state hazards, dirty-file exclusions, recovery requirements, and checkpoint commit policy from HANDOFF.md. Honor the merged brief's Unresolved Disagreements by deciding each explicitly. Route high-risk bounded tasks to builder-heavy. Frontend/UI coding quality defaults to builder; use builder-highspeed only for tiny exact mechanical UI tweaks, and use builder-heavy for frontend only when there is a concrete non-visual correctness/integration hazard. After writing files, respond with the plan dir and next command: /plan-heavy validate ${relative(cwd, planDir)}.`;

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

function parseTargetFiles(taskContent: string): string[] {
  for (const label of ["Files Touched", "Files to Create / Modify", "Target Files", "Files to Modify"]) {
    const section = extractSection(taskContent, label);
    if (!section) continue;
    const files = [
      ...new Set(
        section
          .split("\n")
          .map((line) => line.match(/`([^`]+)`/)?.[1])
          .filter((value): value is string => Boolean(value))
          .filter((p) => p.includes("/") && !p.includes("*") && !p.startsWith(".pi/")),
      ),
    ];
    if (files.length) return files;
  }
  return [];
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
Plan Directory: \`${relative(cwd, planDir)}\`
Task File: \`${relative(cwd, taskPath)}\`

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

## Patch Boundaries From Task
${extractSection(taskContent, "Patch Boundaries") || "TO VERIFY: task missing Patch Boundaries; builder must block or request repair before editing."}

## Preservation Markers From Task
${extractSection(taskContent, "Preservation Markers") || "TO VERIFY: task missing Preservation Markers; builder must block or request repair before editing."}

## Dirty File Rules
- Stage/commit only files listed in this task plus relevant \`.pi/build\` and \`.pi/recovery\` artifacts.
- Do not stage pre-existing dirty files from the status block unless the task explicitly owns them.
- If a target file has pre-existing unrelated dirty hunks, use anchored edits and selective staging.

## Validation / Checkpoint Rules
- Run the task validation from the task file.
- Run preservation marker commands before and after editing.
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

function validatePlan(planDir: string): { ok: boolean; report: string } {
  const required = ["HANDOFF.md", "PLAN_FULL.md", "SCHEDULE.md"];
  const missing = required.filter((f) => !existsSync(join(planDir, f)));
  const schedule = readMaybe(join(planDir, "SCHEDULE.md"));
  const plan = readMaybe(join(planDir, "PLAN_FULL.md"));
  const tasks = listTaskFiles(planDir);
  const findings: string[] = [];

  for (const file of missing) findings.push(`BLOCKER: missing ${file}`);
  if (!existsSync(join(planDir, "TASKS"))) findings.push("BLOCKER: missing TASKS/ directory");
  if (!/Checkpoint Commit/i.test(schedule)) findings.push("BLOCKER: SCHEDULE.md missing Checkpoint Commit column/policy");
  if (!/Recovery Snapshot/i.test(schedule)) findings.push("BLOCKER: SCHEDULE.md missing Recovery Snapshot column/policy");
  if (!/builder-heavy/i.test(schedule + tasks.map(readMaybe).join("\n"))) {
    findings.push("WARN: no builder-heavy task found; acceptable only if plan has no high-risk bounded work");
  }
  if (!hasLabel(plan, "Shared File Hazards")) findings.push("BLOCKER: PLAN_FULL.md missing Shared File Hazards section");
  if (!/dirty/i.test(plan + schedule)) findings.push("WARN: dirty-file handling not mentioned in plan/schedule");

  const requiredLabels = ["Agent", "Why This Agent", "Preservation Contract", "Recovery Requirement", "Patch Boundaries", "Preservation Markers", "TILL-DO", "Success Criteria"];
  for (const task of tasks) {
    const content = readMaybe(task);
    const name = relative(planDir, task);
    for (const label of requiredLabels) {
      if (!hasLabel(content, label)) findings.push(`BLOCKER: ${name} missing "${label}" field/section`);
    }
    if (/builder-heavy/i.test(content) && !hasLabel(content, "Heavy Fit")) findings.push(`BLOCKER: ${name} builder-heavy task missing Heavy Fit`);
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
      "Deterministically collect repo state (branch, recent commits, git status, existing .pi/plans, dirty files, shared-file hazards) and create a planner-heavy handoff for the ensemble flow. " +
      "Creates .pi/plans/<slug>/HANDOFF.md, PLAN_HEAVY_PROMPT.md, and BRIEFS/ prompts. Returns explicit instructions to continue by launching plan-briefer and plan-briefer-fable in parallel, then plan-brief-merger, planner-heavy, and plan_heavy_validate. Use before planning high-risk/long-horizon work.",
    promptSnippet: "Use plan_heavy_handoff to start /plan-heavy, then do not stop: launch plan-briefer + plan-briefer-fable in parallel, merge, plan, and validate.",
    parameters: Type.Object({
      goal: Type.String({ description: "Approved goal/scope for the heavy plan." }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      try {
        const { planDir, prompt, briefPrompt, mergePrompt } = await createHandoff(ctx.cwd, params.goal);
        const relativePlanDir = relative(ctx.cwd, planDir);
        return {
          content: [
            {
              type: "text",
              text:
                `Plan-heavy handoff created at \`${relativePlanDir}\`.\n\n` +
                `IMPORTANT: this tool only created the handoff. Do not stop or answer the user yet. Immediately continue the ensemble, then call plan_heavy_validate.\n\n` +
                `=== PHASE 1: BRIEFS (launch plan-briefer + plan-briefer-fable in parallel) ===\n${briefPrompt}\n\n` +
                `Prompt files:\n- \`${relativePlanDir}/BRIEFS/PROMPT_plan-briefer.md\`\n- \`${relativePlanDir}/BRIEFS/PROMPT_plan-briefer-fable.md\`\n\n` +
                `=== PHASE 2: MERGE (launch plan-brief-merger) ===\n${mergePrompt}\n\n` +
                `=== PHASE 3: PLAN (launch planner-heavy) ===\n${prompt}`,
            },
          ],
          details: { planDir: relativePlanDir },
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
      "Create an execution envelope for one planner-heavy task. Captures current git status, target files, line counts, patch boundaries, preservation markers, snapshot dir, and checkpoint rules. " +
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
      "Validate a generated plan ecosystem (HANDOFF/PLAN_FULL/SCHEDULE/TASKS) for checkpoint commits, recovery snapshots, shared-file hazards, agent routing, patch boundaries, preservation markers, and required task gates. Writes PLAN_HEAVY_VALIDATION.md and returns PASS/BLOCKED.",
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
