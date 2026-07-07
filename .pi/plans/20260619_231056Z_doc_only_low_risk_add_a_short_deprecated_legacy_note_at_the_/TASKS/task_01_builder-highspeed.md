# Task 01 — Deprecated/Legacy note: 5 explorer-class DRv2 agents (`## Role` group)

- **Agent**: builder-highspeed
- **Why This Agent**: Small, explicit, mechanical, module-local, additive (+2 lines) markdown
  insertion across 5 disjoint files, trivially verifiable (numstat `2 0`, frontmatter byte-identical,
  note present once, `## Role` preserved). No shared-file hazard, no large-file rewrite, no
  correctness/security/migration sensitivity → no reason to escalate to `builder` or `builder-heavy`.
- **Spark Budget:** Low (5 identical, bounded single-file edits).
- **Heavy Fit:** Not heavy. No math/algorithm correctness, no subtle multi-file integration, no
  preservation-critical large file. Bounded mechanical doc edit.
- **Scope:** Insert one identical "Deprecated / Legacy" blockquote note at the top of the BODY of
  each of the 5 files below, immediately after the closing frontmatter `---` (line 13) and the
  existing blank line, before the first body element (`## Role`).
- **Files Touched (MODIFY only):**
  - `agents/deep-research-explorer.md`
  - `agents/deep-research-methodical.md`
  - `agents/deep-research-critical.md`
  - `agents/deep-research-creative.md`
  - `agents/deep-research-skeptical.md`

## READ FIRST

1. `HANDOFF.md` in the plan dir (repo-state source of truth; repo is CLEAN).
2. The top 16 lines of each of the 5 target files (`Read` with `limit: 16`) to confirm the verified
   structure before editing:
   - line 1 `---`, lines 2–12 frontmatter keys, line 13 `---` (closing frontmatter),
   - line 14 blank, line 15 `## Role`.
3. Do NOT read or open `agents/deep-search-master.md` for editing — it is OUT OF SCOPE.

## HARD CONSTRAINTS (encode in every edit)

- Do NOT modify YAML frontmatter (lines 1–13 of each file) — byte-identical before/after.
- Do NOT modify `agents/deep-search-master.md`.
- Do NOT touch any file outside the 5 listed above.
- Do NOT alter any existing body content other than inserting the note (+1 blank separator line).

## **Preservation Contract**

For each of the 5 files, the following MUST survive byte-identical (only shifted down by 2 lines for
the body):

- Frontmatter lines 1–13 inclusive (opening `---`, all keys, closing `---`).
- The blank line currently at line 14.
- The `## Role` heading (currently line 15) and ALL body content after it.

## **Recovery Requirement**

Before ANY edit, snapshot all 5 files to `.pi/recovery/01/before/` preserving relative paths, e.g.:

```bash
mkdir -p .pi/recovery/01/before/agents
cp agents/deep-research-explorer.md   .pi/recovery/01/before/agents/
cp agents/deep-research-methodical.md .pi/recovery/01/before/agents/
cp agents/deep-research-critical.md   .pi/recovery/01/before/agents/
cp agents/deep-research-creative.md   .pi/recovery/01/before/agents/
cp agents/deep-research-skeptical.md  .pi/recovery/01/before/agents/
```

Do NOT stage `.pi/recovery/` in the checkpoint commit.

## Engineering Constraints

- **SoC boundary:** This task only inserts documentation; it does not change agent behavior, tools,
  or frontmatter config. Group boundary = "explorer-class agents whose first body element is `## Role`".
- **DYC (Document Your Code):** The note IS the documentation deliverable; keep it to the single
  exact blockquote — no extra prose.
- **DRY / Rule-of-Three:** The note text is identical across all 5 files by design (consistency).
  Do NOT introduce a shared include/partial — markdown agent files are standalone; 5 identical
  literals is correct here, not duplication to abstract.
- **KISS / YAGNI:** Insert exactly 2 lines (note + blank). No reformatting, no reflow, no extra
  metadata, no link-reference definitions.
- **TDD/test-first:** N/A (doc-only). Validation = post-edit greps/diff below substitute for tests.

## Context Summary

These 5 files are legacy Deep Research v2 phase agents superseded by the single-agent Deep Search
Master (`agents/deep-search-master.md`). All 5 share identical frontmatter structure (closing `---`
at line 13) and begin their body with a `## Role` heading at line 15.

## Implementation Detail

**Exact note text (identical for all 5 files):**

```markdown
> **⚠️ Deprecated / Legacy.** This multi-agent Deep Research v2 pipeline has been superseded by the single-agent **Deep Search Master** (`agents/deep-search-master.md`). These phase agents are retained for reference only and are no longer the recommended path.
```

**Insertion point (each file):** between the existing blank line 14 and the `## Role` line 15.
Resulting top-of-body becomes:

```
---                                       (line 13, closing frontmatter — UNTOUCHED)
                                          (line 14, existing blank — preserved)
> **⚠️ Deprecated / Legacy.** This ...    (INSERTED note)
                                          (INSERTED blank separator)
## Role                                   (preserved; was line 15)
```

Apply the identical insertion to all 5 files.

## Patch Boundaries

- Allowed paths: ONLY the 5 files listed under "Files Touched".
- Per file: exactly **+2 lines, 0 deletions** (`git diff --numstat` → `2  0  <file>`).
- No edits anywhere in lines 1–13. No edits to any body line other than inserting before line 15.

## Preservation Markers (concrete commands)

Run per file (`F` = each target file):

```bash
# Frontmatter delimiters: opening line 1, closing line 13 (the 2nd '---')
grep -n '^---$' "$F" | head -2          # expect: 1:--- and 13:---
sed -n '13p' "$F"                       # expect: ---
sed -n '15p' "$F"                       # expect (pre-edit): ## Role
grep -n '^## Role' "$F"                 # must remain present after edit
```

## TODO Template

```
[ ] Read HANDOFF.md
[ ] Read top 16 lines of each of the 5 files; confirm line 13 '---', line 15 '## Role'
[ ] Create recovery snapshots in .pi/recovery/01/before/agents/
[ ] Insert exact note + blank separator after line 14 in each of the 5 files
[ ] Run TILL-DO gates (below) for each file
[ ] Focused diff review (git diff of the 5 files)
[ ] Selective stage ONLY the 5 files; checkpoint commit
[ ] Record commit hash in SCHEDULE.md (Checkpoint Commit col + log)
```

## TILL-DO Gates (must all pass per file before COMPLETE)

1. **Patch-boundary check:** `git diff --numstat agents/deep-research-explorer.md ...` → each file
   shows `2  0`. `git status --porcelain` lists ONLY the 5 task files.
2. **Frontmatter byte-identical:**
   `diff <(sed -n '1,13p' .pi/recovery/01/before/agents/<f>) <(sed -n '1,13p' agents/<f>)` → empty.
3. **Preservation-marker check:** `grep -n '^## Role' agents/<f>` → present (now line 17).
4. **Note present once:** `grep -c 'Deprecated / Legacy' agents/<f>` → `1`.
5. **Master reference check:** `grep -F 'agents/deep-search-master.md' agents/<f>` → match.
6. **Anchor check:** the note line sits AFTER line 13 `---` and BEFORE `## Role`
   (`grep -n 'Deprecated / Legacy' agents/<f>` returns line 15).
7. **Out-of-scope check:** `git status --porcelain` does NOT list `agents/deep-search-master.md`
   or any non-task file.

## Success Criteria

- All 5 files edited; each `git diff --numstat` = `2  0`.
- Post-edit marker checks pass for every file (frontmatter intact, note ×1, `## Role` preserved,
  master reference present).
- Focused `git diff` review confirms only the 2-line insertion per file.
- Recovery snapshots exist under `.pi/recovery/01/before/agents/`.
- Checkpoint commit created with selective staging of ONLY the 5 files; hash recorded in SCHEDULE.md.

## Files to Create / Modify

- **Modify:** the 5 `agents/deep-research-*.md` files listed above.
- **Create (working artifact, not committed):** `.pi/recovery/01/before/agents/<5 files>`.

## Prerequisite Files

- `HANDOFF.md` (read).
- The 5 target files (read top 16 lines each before editing).

## STOP Rules

- STOP if any target file's closing frontmatter `---` is NOT at line 13 or line 15 is NOT `## Role`
  (structure drifted from plan) → re-verify and report before editing.
- STOP if a `git diff --numstat` for any file is not `2  0` (unexpected deletion/modification).
- STOP if frontmatter (lines 1–13) differs from the snapshot.
- STOP if any file outside the 5-file list appears in `git status` (especially
  `agents/deep-search-master.md`).
- STOP and roll back from `.pi/recovery/01/before/` if any gate fails; do not commit partial/incorrect edits.
