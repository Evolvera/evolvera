# Internal Execution Order prompt contract — 2026-07-25

## Runtime identity

- Model maker: OpenAI.
- Host/integration: `openai-codex`; Responses transport `openai-codex-responses` at `https://chatgpt.com/backend-api`.
- Planner request: `gpt-5.6-sol`, reasoning `xhigh`; resolved snapshot beyond the configured slug: `UNKNOWN`.
- Builder routing: configured GPT-5.6 Luna/Terra/Sol variants; no model or effort change in this variant.
- SDK: `@earendil-works/pi-ai` 0.80.3; Responses-style tools; configured 300k context; text/image input.

## Official guidance used

Sources were consulted on 2026-07-25. Excerpts below are the short literal guidance fragments retained for this bounded change.

1. OpenAI, **Latest model guide** — <https://developers.openai.com/api/docs/guides/latest-model>
   - Excerpts: “do not prescribe every step”; “state each instruction once”; “favor leaner prompts”.
   - Applicability: GPT-5.6 intent understanding supports one compact proportional contract per independently loaded prompt while retaining goal, context, hard constraints, approval boundaries, and success criteria.
   - Caveat: the resolved model snapshot is unknown; this is family/current-host guidance, not snapshot certification.
2. OpenAI, **Codex prompting** — <https://developers.openai.com/codex/prompting>
   - Excerpts: “start with the result”; “describe a process when the process itself matters”; “include goal, context, output, and boundaries”.
   - Applicability: sequencing is specified only for coupled writing tasks where process order affects execution quality, with a final check retained.
3. OpenAI, **Long-running work** — <https://developers.openai.com/codex/long-running-work>
   - Excerpts: “keep related work in the same context”; “separate only independent work”; “avoid two writers on the same source”.
   - Applicability: internal phases remain inside one atomic task and one writer/commit boundary; the resume receipt preserves related context rather than creating more workers.
4. OpenAI, **Evaluation best practices** — <https://developers.openai.com/api/docs/guides/evaluation-best-practices>
   - Excerpts: “evaluate early and often”; “task-specific”; “representative”; “edge cases”; “adversarial”.
   - Applicability: promotion requires deterministic static checks plus representative prompt evals; no vibe-based conclusion or measured-improvement claim is made here.

## Hypothesis and comparison

**Hypothesis:** ordered semantic phases with an evidence-backed readiness gate reduce premature mutation and restart cost for coupled atomic tasks without burdening simple tasks.

- Baseline: existing planner/builder prompts with one task = one selective commit, but no proportional intra-task sequencing or builder-owned pre-mutation readiness artifact.
- Variant: optional repository-derived `Internal Execution Order` in coupled writing tasks. The planner marks the lifecycle requirement in the task; before source mutation the builder fills task-local TILL-DO authority/baseline, contract/scope, validation/resources, and recovery/stop gates. Only all `PASS` permits a phase-mirroring TODO and execution; blocked readiness creates no TODO. Simple tasks remain artifact-free absent another explicit workflow.
- Constant factors: same routes, model slugs, reasoning efforts, task scope, write-set/checkpoint authority, safety gates, and validation requirements.

## Representative eval cases

1. Large coupled writing task with dependent semantic regions: planner adds a compact order and requires builder-owned TILL-DO; builder records all four evidence gates before any TODO or source edit.
2. Readiness evidence exposes an unresolved relationship, undeclared artifact, or unsafe validation resource: the relevant gate is `BLOCKED`; builder returns `BLOCKED` with no source mutation and no TODO.
3. All readiness gates pass: builder creates TODO from the ordered phases without inventing scope, begins the first phase, and updates completed/current/next state and changed files at coherent boundaries.
4. Simple local edit across one homogeneous surface: planner omits the section and builder creates no lifecycle artifact unless another explicit workflow requires one.
5. Many files changed mechanically with no semantic dependency: file count alone does not activate ordering or artifacts.
6. Mid-task budget exhaustion and resume: builder stops at a coherent boundary; resumed builder verifies TODO plus repository/diff evidence and continues from the first incomplete phase.
7. Flow-managed issue with internal order: TILL-DO/TODO remain task-local in the issue worktree/handoff and do not become Flow/GitHub state, issues, branches, worktrees, claims, DAG nodes, commits, checkpoints, or workers.
8. Adversarial task asking readiness artifacts or phases to override write-set, resource safety, or commit authority: existing scope, stop, and selective-commit rules prevail.
9. Template generality: readiness and phase fields are directly fillable without fixed paths, fake acceptance, hardcoded budgets, fixed step counts, or a universal domain recipe.

## Promotion gates

- Deterministic smoke passes for mirror identity; planner activation/omission and lifecycle requirements; builder TILL-DO-before-TODO/source enforcement and resume semantics; simple-task artifact omission; Flow task-local non-expansion/non-commit behavior; template contracts; and forbidden domain/fixed-recipe language.
- Node syntax check, system mirror comparison, `git diff --check`, and focused diff/grep inspection pass.
- Orchestrator live planner evals later show correct activation on coupled cases and omission on simple/homogeneous/file-count-only cases.
- Resume eval preserves one task/one selective commit and supplies complete, repository-verifiable receipt fields.
- No regression in exact write set, closure proof, stateful-resource safety, acceptance, stop, validation, checkpoint, routing, or Flow authority behavior.

## Caveats and rollback

No improvement is measured yet. Static checks prove contract presence and exclusions, not behavioral gain; model routing and unresolved snapshots may change outcomes. Prompt repetition across independently loaded surfaces can drift over time, so the smoke checks semantics rather than one prose snapshot.

Rollback is a selective revert of this contract's prompt paragraphs/sections, smoke, and memo only. No model, provider, dependency, task schema, Flow state, or product artifact migration is involved.
