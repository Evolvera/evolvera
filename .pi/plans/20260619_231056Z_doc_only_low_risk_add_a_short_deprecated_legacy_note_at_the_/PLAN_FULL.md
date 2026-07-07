# PLAN_FULL — Deprecated/Legacy note on 7 legacy Deep Research v2 phase agents

## 1. Objective & Scope

**Objective:** Insert a short "Deprecated / Legacy" note at the very top of the **body**
(immediately after the closing YAML frontmatter `---`, before the first body element) of each
of the 7 legacy Deep Research v2 phase agents. The note states that the multi-agent deep research
pipeline has been superseded by the single-agent **Deep Search Master**
(`agents/deep-search-master.md`).

**In scope (MODIFY only — 7 files):**
- `agents/deep-research-explorer.md`
- `agents/deep-research-methodical.md`
- `agents/deep-research-critical.md`
- `agents/deep-research-creative.md`
- `agents/deep-research-skeptical.md`
- `agents/deep-research-auditor.md`
- `agents/deep-research-finalizer.md`

**Out of scope (HARD CONSTRAINTS — must NOT change):**
- Do NOT modify any YAML frontmatter (lines 1–13 of each file).
- Do NOT modify `agents/deep-search-master.md`.
- Do NOT touch any other file in the repo.
- Do NOT alter existing body content other than inserting the note (+ one blank separator line).

**Classification:** doc-only, low-risk, mechanical, single-file-local markdown insertion across
7 disjoint sibling files.

## 2. Handoff / Repo-State Baseline

Source of truth: `HANDOFF.md` in this plan dir.

- CWD: `/Users/j.henrique/.pi/agent`
- Branch: `main`
- Git status: **CLEAN** (no dirty files; no dirty-file exclusion needed, but selective staging is still enforced per policy).
- Recent commits (top): `97e670d feat: expose plan-heavy harness as agent tools`.
- Active plan state: none pre-existing for this work.
- Shared-file hazards detected by harness: **None**. Verified by planner: the 7 targets are disjoint; no two tasks touch the same file.

### Verified file structure (read, not invented)

All 7 files share an identical frontmatter shape:
- Opening frontmatter `---` at **line 1**.
- Closing frontmatter `---` at **line 13** (2nd `---` in the file).
- Blank line at **line 14**.
- First body element at **line 15**.

Two body-start patterns (this drives the task split):

| Group | Files | First body element (line 15) — PRESERVATION MARKER |
|-------|-------|-----------------------------------------------------|
| A | explorer, methodical, critical, creative, skeptical | `## Role` (heading) |
| B | auditor, finalizer | `You are the **AUDITOR / RED TEAM** ...` / `You are the **FINALIZER** ...` (paragraph) |

## 3. Shared File Hazards & Mitigations

- **No cross-task shared files.** Each of the 7 files is touched by exactly one task. Tasks are
  independently committable and revertible.
- **Finalizer body `---` hazard:** `agents/deep-research-finalizer.md` contains additional `---`
  horizontal rules in its body (lines 61, 67, 73, 86, 93, 100, 107, 112). The insertion anchor MUST
  be the **closing frontmatter delimiter = the 2nd `---` in the file (line 13)**, never a later body
  `---`. Encoded as an explicit preservation marker in Task 02.
- **Git index race on parallel commits:** Although the two tasks are parallel-capable (disjoint
  files), checkpoint commits are **serialized** by the orchestrator with selective staging of only
  that task's files (`git add <explicit paths>`), never `git add -A`/`.`.

## 4. Architecture / Implementation Approach

Identical, additive edit per file. Given existing structure:

```
13: ---            (closing frontmatter — UNTOUCHED)
14: (blank)        (UNTOUCHED)
15: ## Role        (or "You are the **...**" paragraph — UNTOUCHED, shifts down +2)
```

The edit inserts exactly **2 lines** between line 14 (existing blank) and line 15 (first body
element): the note blockquote + one blank separator. Result:

```
13: ---                                  (UNTOUCHED)
14: (blank)                              (preserved)
15: > **⚠️ Deprecated / Legacy.** ...    (INSERTED note)
16: (blank)                              (INSERTED separator)
17: ## Role  /  You are the **...**       (preserved; was line 15)
```

**Exact note text (identical for all 7 files):**

```markdown
> **⚠️ Deprecated / Legacy.** This multi-agent Deep Research v2 pipeline has been superseded by the single-agent **Deep Search Master** (`agents/deep-search-master.md`). These phase agents are retained for reference only and are no longer the recommended path.
```

**Net effect per file:** frontmatter (lines 1–13) byte-identical; all pre-existing body content
byte-identical (shifted down 2 lines); `git diff --numstat` shows exactly `2   0   <file>`.

## 5. Task Summary

| ID | Task File | Agent | Files | Body marker |
|----|-----------|-------|-------|-------------|
| 01 | `TASKS/task_01_builder-highspeed.md` | builder-highspeed | explorer, methodical, critical, creative, skeptical (5) | `## Role` heading |
| 02 | `TASKS/task_02_builder-highspeed.md` | builder-highspeed | auditor, finalizer (2) | `You are the **...**` paragraph |

### Granularity justification

- **Not 7 separate tasks:** the operation is trivial, additive (+2 lines), identical, and the files
  are disjoint — 7 commits/snapshots would be pure overhead with no extra safety.
- **Not 1 task of 7:** Group A and Group B differ in their **preservation marker and validation
  boundary** (heading vs paragraph as the first preserved body element), and Group B carries the
  finalizer body-`---` hazard. Splitting along that validation/failure boundary keeps each task's
  validation uniform and unambiguous.
- **Result: 2 tasks**, grouped by body-start pattern. Each task is one safe commit/rollback/
  validation unit (revert = restore that task's files).

### Agent routing justification

Both tasks → **builder-highspeed**: small, explicit, mechanical, module-local, additive markdown
insertion that is easy to verify (numstat `2 0`, frontmatter byte-identical, note present once,
first body element intact). No shared-file hazards, no large-file rewrite, no math/security/
migration/correctness sensitivity. The only subtlety (finalizer body `---`) is fully bounded by an
explicit "anchor = 2nd `---`/line 13" preservation marker, which stays within builder-highspeed's
competence given exact instructions. → No justification to escalate to `builder` or `builder-heavy`.

## 6. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Note inserted after a body `---` (finalizer) instead of frontmatter close | Low | Anchor = 2nd `---` (line 13); post-edit grep that note sits between line 13 and first body element |
| Frontmatter accidentally edited | Low | Pre-edit recovery snapshot + post-edit byte-compare of lines 1–13; numstat must be `2 0` |
| Existing body content altered | Low | numstat `2 0` (0 deletions); first body element grep still present |
| Touching out-of-scope file (`deep-search-master.md` or others) | Low | Patch boundary = explicit file list; selective staging only |
| Parallel commit index race | Low | Serialize checkpoint commits; `git add <explicit paths>` only |
| Pre-existing dirty files swept into commit | None (repo CLEAN) | Selective staging of task files only; never `git add -A` |

## 7. Validation Strategy

Per file, after edit (and before COMPLETE):
1. **Frontmatter integrity:** lines 1–13 byte-identical to the pre-edit recovery snapshot
   (`diff <(sed -n '1,13p' before) <(sed -n '1,13p' after)` → empty).
2. **Additive-only:** `git diff --numstat <file>` → exactly `2   0   <file>`.
3. **Note present once:** `grep -c 'Deprecated / Legacy' <file>` → `1`.
4. **Master reference present:** `grep -F 'agents/deep-search-master.md' <file>` → match.
5. **First body element preserved:** Group A `grep -n '^## Role' <file>`; Group B
   `grep -n '^You are the \*\*' <file>` → still present, directly after the note's blank separator.
6. **Out-of-scope untouched:** `git status --porcelain` lists only that task's files;
   `agents/deep-search-master.md` NOT listed.
7. **Focused diff review:** `git diff <files>` visually confirms only the 2-line insertion per file.

Final gate: `plan_heavy_validate` on the plan dir.
