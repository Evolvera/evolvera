---
name: project-memory
description: "Persistent per-project memory with authoritative Markdown chunks, normalized JSON architecture, and deterministic projections injected at runtime."
---

=== PROJECT-MEMORY PROTOCOL ===

## LOCATION
All project memory is stored in: `{cwd}/.pi/memory/`

> **Note**: The `.pi/` folder at the project root is the standard directory for **all** agent artifacts:
> - `.pi/plans/` — persistent plans (planner, designer, content-writer, polisher)
> - `.pi/build/` — temporary execution checklists (TILL-DO.md, TODO.md)
> - `.pi/validate/` — validation artifacts (REVIEW.md, FIX_REQUIRED.md)
> - `.pi/memory/` — persistent project memory (this skill)
> - `.pi/flow/` — **optional**, read-only local delivery history owned by the `flow-orca` skill; nothing there is authoritative, and its absence never blocks resumption
>
> `.pi/memory/` stores context and general knowledge; it contains neither claims nor delivery state. For delivery, the current GitHub state always takes precedence (grant in the Project README, issue bodies, comments, and Project Status), followed by live evidence from Orca workspaces/terminals; both take precedence over `.pi/flow/`, `.pi/memory/`, and chat context. The absence or staleness of these caches never authorizes recreating a backlog, claiming an issue, creating a workspace, or overwriting remote state.

| File | Description |
|---------|-----------|
| `_summary.md` | Compact human-readable summary injected into context (bounded: root 8k). Derived from canonical chunks, without replacing the source with full session text. |
| `setup.md` | How to run, build, test, and deploy. Scripts, dependencies, runtime. |
| `bugs.md` | Known bugs with status [ACTIVE]/[RESOLVED]. Workarounds and fixes. |
| `architecture.md` | Durable human-readable narrative: patterns, boundaries, structure, and architectural lessons; does not duplicate the normalized tables. |
| `architecture.json` | Structured and normalized source of truth for agents; records have stable IDs and exact repository-relative evidence. |
| `architecture.html` | Self-contained human-readable view generated from `architecture.json`; never edit manually or use as an authority. |
| `env.md` | Required and optional environment variables. Secrets as [REDACTED]. |
| `api-external.md` | Third-party APIs, rate limits, quirks. |
| `decisions.md` | Technical decisions. Decision + alternatives + rationale. |

---

## RULE 1 — SESSION START (AUTOMATIC VIA EXTENSION)

The `project-memory.ts` extension and `plastic-memory` surface inject a projected context in `before_agent_start` containing:
- root summary (bounded 8k),
- active chunk index (bounded 4k),
- optional architecture index (bounded 4k).

These projections are derived, do not replace facts, and do not imply a full project scan.

Memory can operate in three modes:
- **canonical**: canonical memory with a projection surface;
- **legacy-flat**: legacy fallback (`_summary.md` + legacy index);
- **uninitialized**: no initialized memory.

Operational compatibility: in a legacy environment with `pi-observational-memory` active, `project-memory` remains bridge/context-only and does not force an ownership cutover here.

If `.pi/memory/` is absent, do not treat its absence as confirmation that this is a new project.

**Delivery exception:** when the current intent is to continue board/issues/PRs via the `flow-orca` skill, that skill’s full re-entry happens first. Missing memory does not mean this is a new project when GitHub already contains a board, issues, branches, or PRs, or when Orca already has campaign workspaces. Only create/update memory after remote reconciliation, if still necessary; never let memory block resumption of remote WIP.

---

## RULE 2 — TARGETED INITIALIZATION (NOT A GLOBAL RESCAN)

If `.pi/memory/` does not exist in the current project:

1. Create the directory: `mkdir -p .pi/memory/`.
2. Copy only the required templates (`cp ~/.pi/agent/skills/project-memory/templates/* .pi/memory/`).
3. For explicit bootstrap, use at most **3 scouts in parallel**, each with a scoped prompt (setup, architecture/APIs, env/bugs/decisions), only for missing data; do not require reading the entire repository.

**Scout A — Setup, Infrastructure & Config:** scripts, dependencies, runtime, tests, and critical hooks.

**Scout B — Architecture & APIs:** normalized architectural evidence with IDs and relationships; do not invent flows.

**Scout C — Env, Bugs & Decisions:** environment variables, technical decisions, risks, and relevant inconsistencies.

4. Perform targeted bootstrap with a builder/direct edits only in the necessary files and sections, through an explicitly supported canonical publication path. In the currently verified root, the publication/provider surface is not installed; authority actions report `unavailable`.
5. Update derived projections (`_summary.md` and indexes) only as part of that explicit canonical publication and after the target artifacts; the runtime can rebuild bounded projections in memory without writing.
6. Do not perform a global rescan, independently rewrite the entire summary, or overwrite architecture without new evidence.

If `.pi/memory/` already exists, but `architecture.json` is absent:
- do not treat the project as new;
- preserve Markdown and the remote GitHub state;
- initialize architecture only when there is a material change and an explicitly supported path.

---

## RULE 3 — INCREMENTAL ARCHITECTURE MAP (JSON + HTML)

When the plastic owner is active, the operation uses the roles `observer`, `reflector`, `compactor`, and `project-promoter` with `medium` on `openai-codex/gpt-6-luna`. The 10k/20k triggers are inspection boundaries, not a cadence. Each cycle uses a contiguous snapshot of a completed turn, with an approximate limit of 100k tokens; there is no multipart: completion is semantic and exact. There is at most one automatic retry. Compaction uses identity: six complete cycles form a stride, compacting the two oldest and preserving the four newest. A detached result is applied only when the host is settled/idle, there are no pending messages, and branch/identity guards pass; an invalid or mismatched internal attempt is canceled, while a manual/threshold/overflow no-match retains the native fallback. Do not claim live quality.

Backfill and publication are explicit operations: `backfill` starts with a no-write report, uses a bounded cursor, one completed-turn window at a time, explicit pause/resume and retry; it does not run automatically. In the currently verified root, the exposed authority actions (`propose`, `accept`, `migrate`, `backfill`, `retry`) return `unavailable`, because there is no provider-backed worker or provider-to-canonical publication path.

Canonical project/chunk Markdown remains authoritative for facts and human-readable lessons. JSON is an additive, normalized, agent-facing layer; HTML is always derived from JSON and is never agent input. The output of `project-promoter` is proposal-only: acceptance requires current evidence and an explicitly supported canonical path; there is no autonomous publication.

Update `architecture.json` only when there is a material change in architecture, flows, evidence, or gaps — not on every code edit. Before mutating:
- Compare `snapshot.sourceHead` with the current Git state; a mismatch is `POSSIBLY_STALE`, not proof of an error. Verify affected evidence before changing records.
- Derive the affected artifact set from `evidence.path`/`evidenceIds`; preserve stable IDs and unaffected records.
- Update or remove relationships and flow steps atomically so no references are dangling. If the source does not support a claim, mark it `unknown`/gap `open` instead of inventing it.
- Update `sourceHead`, `lastVerifiedAt`, `scope`, and confidence according to actual evidence; do not record transient delivery status.

Required checkpoint: update the required Markdown narrative and JSON, validate the JSON, render the HTML, and only then update `_summary.md`. If validation fails, do not render or accept the HTML; report the error explicitly. Never use HTML to reconstruct or replace JSON.

Commands, run from the project root and resolved relative to this skill directory:
```sh
PI_AGENT_DIR="${PI_AGENT_DIR:-$HOME/.pi/agent}"
SKILL_DIR="$PI_AGENT_DIR/skills/project-memory"
node "$SKILL_DIR/scripts/validate-architecture.mjs" .pi/memory/architecture.json
node "$SKILL_DIR/scripts/render-architecture.mjs" .pi/memory/architecture.json .pi/memory/architecture.html
```

## RULE 4 — SAVE (add new information)

When you discover something new during work:
1. Determine which `.md` file is correct and draft the new entry.
2. Edit only the necessary section; update `_summary.md`/indexes only if the explicit canonical publication path supports this bounded update.
3. Keep the format consistent: heading + bullets + date + evidence.
4. Do not perform a global scan or overwrite without a concrete semantic change.

**When to save automatically:**
- Completed bug fix → `bugs.md`
- Confirmed deploy/recovery/rollback incident → `bugs.md` + `setup.md`
- New feature that changes architecture → `architecture.md`
- Change to scripts/config → `setup.md`
- Technical decision made → `decisions.md`
- API quirk discovered → `api-external.md`
- Change to environment variables → `env.md`

**Minimum operational lesson:** record only durable facts: symptom, proven root cause, incorrect assumption, correct sequence, prerequisites, post-operation smoke test, rollback, and relevant files/commands. Before repeating a deploy, migration, or recovery, consult this entry and verify against the current state. Never record secret values, raw sensitive output, transient board/PR state, conjecture, or chat narrative; use `[REDACTED]` and keep the current GitHub/host/repository state authoritative.

---

## RULE 5 — EDIT (update existing information)

When something changes that affects saved memory:
1. Identify the specific section and target file.
2. Update only what is necessary.
3. Update the bounded derived projection only if the explicit canonical publication path supports this update; otherwise, preserve the derived files and record the gap.

Examples of when to edit:
- Bug was resolved → update status to [RESOLVED] in `bugs.md`
- Architecture changed → update the section in `architecture.md`
- Decision was reversed → update it in `decisions.md`
- Setup changed (new script, new dependency) → update `setup.md`

---

## RULE 6 — DELETE (remove obsolete information)

When memory is no longer relevant:
1. Identify the correct section/example to remove.
2. Remove only the relevant passage.
3. Update derived projections only if the removal is part of an explicit, supported canonical publication; otherwise, preserve them and record the gap.

---

## RULE 7 — REGENERATE `_summary.md`

Update `_summary.md` and indexes only when canonical memory has been published through an explicitly supported path, and only with bounded context. If the projection is inconsistent, the runtime can rebuild it in memory; do not independently rewrite the summary or reconstruct HTML/JSON from a projection.

- Do NOT reinject into the current session — the session already has conversation context
- The next session will use the published projection, if available

---

## RULE 8 — SEARCH AND RETRIEVAL SURFACES

Use explicit, targeted memory surfaces:

- `memory_recall` (exact ID): `pm:p:` for a project or `pm:c:` for a chunk; reads canonical Markdown and returns state/evidence.
- `memory_search` (bounded filters): `text`, `tag`, `tags`, `category`, `status`, `confidence`, `limit`; returns metadata/snippets, not transcript navigation or full bodies.
- `/memory:status` and `/memory:view [visible|full]` for current state and context.
- `/om:status` and `/om:view [visible|full]` as compatibility aliases.
- `/memory:propose`, `/memory:accept`, `/memory:migrate`, `/memory:backfill`, `/memory:retry` on the currently verified surface return `unavailable`; do not assume publication, migration, backfill, or a provider.

Do not use a bare textual `recall` call or assume a function without an ID. For architecture, validate `architecture.json` (IDs/evidence/path) and actual evidence before a material decision; `architecture.html` is a derived view only. In legacy-flat mode, preserve the compatibility marker and do not treat the summary as canonical chunks.

In the codebase, use `scout` for real gaps. When you find something relevant, apply SAVE/EDIT to the canonical path only if an explicitly supported path exists.

Search before making an architectural decision, doing complex debugging, or handling a specific memory request.

---

## RULE 9 — REQUIRED CHECKLIST (before sending a response)

Run through this mentally before EVERY response:
```
[ ] Did I take any action that generated or changed project knowledge?
[ ] Did I record it in the correct `.md` file and update projections (`_summary.md`/indexes) only if an explicit canonical path supported bounded publication?
[ ] If there was an architectural/material change, did I validate `architecture.json` and generate `architecture.html` before publishing any projection?
[ ] Did I preserve GitHub (and Orca’s live evidence) as delivery authority and follow the evidence rule?
[ ] Did I avoid automatic global scans and commands/recall without an explicit ID?
[ ] Did I consider delegating to a builder if the operation is broad?
```

---

## RULE 10 — ENTRY FORMAT

Each entry in a `.md` file must follow:
```markdown
## Descriptive Entry Title
- **Date**: YYYY-MM-DD
- **Detail 1**: description
- **Detail 2**: description
- **Related files**: path/to/file1, path/to/file2
```

- `bugs.md`: use status [ACTIVE] or [RESOLVED]
- `decisions.md`: Decision + Alternatives considered + Rationale
- `architecture.md`: include Mermaid diagrams when relevant
- `env.md`: secrets as [REDACTED]
