# Task 02 — Deprecated/Legacy note: DRv2 Auditor & Finalizer (paragraph-body group)

- **Agent**: builder-highspeed
- **Why This Agent**: Small, explicit, mechanical, additive (+2 lines) markdown insertion across 2
  disjoint files, trivially verifiable. The one subtlety — finalizer has body `---` rules later —
  is fully bounded by an explicit "anchor = closing frontmatter `---` at line 13" preservation
  marker, which stays within builder-highspeed competence given exact instructions. No shared-file
  hazard, no large-file rewrite, no correctness/security/migration sensitivity → no escalation.
- **Spark Budget:** Low (2 bounded single-file edits).
- **Heavy Fit:** Not heavy. Bounded mechanical doc edit; the body-`---` distinction is handled by a
  concrete grep/anchor rule, not by judgment requiring a heavy builder.
- **Scope:** Insert one identical "Deprecated / Legacy" blockquote note at the top of the BODY of
  each of the 2 files below, immediately after the closing frontmatter `---` (line 13) and the
  existing blank line, before the first body element (the `You are the **...**` paragraph).
- **Files Touched (MODIFY only):**
  - `agents/deep-research-auditor.md`
  - `agents/deep-research-finalizer.md`

## READ FIRST

1. `HANDOFF.md` in the plan dir (repo-state source of truth; repo is CLEAN).
2. The top 16 lines of each of the 2 target files (`Read` with `limit: 16`) to confirm structure:
   - line 1 `---`, lines 2–12 frontmatter keys, line 13 `---` (closing frontmatter),
   - line 14 blank, line 15 paragraph starting `You are the **AUDITOR / RED TEAM** ...` (auditor)
     or `You are the **FINALIZER** ...` (finalizer).
3. For `deep-research-finalizer.md` ONLY: note that additional `---` horizontal rules exist later in
   the body (lines 61, 67, 73, 86, 93, 100, 107, 112). The insertion anchor is the **2nd `---`
   (line 13)** — NOT any later body `---`.
4. Do NOT read or open `agents/deep-search-master.md` for editing — it is OUT OF SCOPE.

## HARD CONSTRAINTS (encode in every edit)

- Do NOT modify YAML frontmatter (lines 1–13 of each file) — byte-identical before/after.
- Do NOT modify `agents/deep-search-master.md`.
- Do NOT touch any file outside the 2 listed above.
- Do NOT alter any existing body content other than inserting the note (+1 blank separator line).
- Do NOT insert the note after a body `---` rule (finalizer hazard) — anchor is line 13 only.

## **Preservation Contract**

For each of the 2 files, the following MUST survive byte-identical (body shifted down by 2 lines):

- Frontmatter lines 1–13 inclusive (opening `---`, all keys, closing `---`).
- The blank line currently at line 14.
- The first body paragraph (currently line 15, `You are the **...**`) and ALL body content after it,
  including every later body `---` horizontal rule in the finalizer.

## **Recovery Requirement**

Before ANY edit, snapshot both files to `.pi/recovery/02/before/` preserving relative paths:

```bash
mkdir -p .pi/recovery/02/before/agents
cp agents/deep-research-auditor.md   .pi/recovery/02/before/agents/
cp agents/deep-research-finalizer.md .pi/recovery/02/before/agents/
```

Do NOT stage `.pi/recovery/` in the checkpoint commit.

## Engineering Constraints

- **SoC boundary:** Documentation-only insert; no behavior/config change. Group boundary =
  "agents whose first body element is a `You are the **...**` paragraph".
- **DYC:** The note IS the deliverable; keep to the single exact blockquote.
- **DRY / Rule-of-Three:** Note text identical to Task 01 by design (consistency across the legacy
  family). Do NOT abstract into an include — standalone agent files; 2 identical literals is correct.
- **KISS / YAGNI:** Insert exactly 2 lines (note + blank). No reformatting, no reflow.
- **TDD/test-first:** N/A (doc-only). Validation greps/diff below substitute for tests.

## Context Summary

`deep-research-auditor.md` and `deep-research-finalizer.md` are legacy Deep Research v2 phase agents
superseded by the single-agent Deep Search Master (`agents/deep-search-master.md`). Both share the
identical frontmatter structure (closing `---` at line 13) but begin their body with a prose
paragraph (`You are the **...**`) at line 15 rather than a heading.

## Implementation Detail

**Exact note text (identical for both files, identical to Task 01):**

```markdown
> **⚠️ Deprecated / Legacy.** This multi-agent Deep Research v2 pipeline has been superseded by the single-agent **Deep Search Master** (`agents/deep-search-master.md`). These phase agents are retained for reference only and are no longer the recommended path.
```

**Insertion point (each file):** between the existing blank line 14 and the first body paragraph
(line 15). Resulting top-of-body becomes:

```
---                                       (line 13, closing frontmatter — UNTOUCHED)
                                          (line 14, existing blank — preserved)
> **⚠️ Deprecated / Legacy.** This ...    (INSERTED note)
                                          (INSERTED blank separator)
You are the **AUDITOR / RED TEAM** ...    (preserved; was line 15 — finalizer: "You are the **FINALIZER** ...")
```

## Patch Boundaries

- Allowed paths: ONLY `agents/deep-research-auditor.md` and `agents/deep-research-finalizer.md`.
- Per file: exactly **+2 lines, 0 deletions** (`git diff --numstat` → `2  0  <file>`).
- No edits anywhere in lines 1–13. No edits to any later body `---` rule (finalizer).

## Preservation Markers (concrete commands)

```bash
# Closing frontmatter must be the 2nd '---' at line 13 (auditor has only 2 '---'; finalizer has more)
grep -n '^---$' agents/deep-research-auditor.md   | head -2   # expect 1:--- and 13:---
grep -n '^---$' agents/deep-research-finalizer.md | head -2   # expect 1:--- and 13:---
sed -n '13p' agents/deep-research-auditor.md                  # expect ---
sed -n '15p' agents/deep-research-auditor.md                  # expect: You are the **AUDITOR / RED TEAM** ...
sed -n '15p' agents/deep-research-finalizer.md                # expect: You are the **FINALIZER** ...
grep -n '^You are the \*\*' agents/deep-research-auditor.md   # must remain present after edit
grep -n '^You are the \*\*' agents/deep-research-finalizer.md # must remain present after edit
# Finalizer body rules must survive unchanged:
grep -n '^---$' agents/deep-research-finalizer.md             # after edit: 1, 15... NO — see gate 6
```

## TODO Template

```
[ ] Read HANDOFF.md
[ ] Read top 16 lines of each of the 2 files; confirm line 13 '---', line 15 'You are the **...**'
[ ] Confirm finalizer body '---' rules (61,67,73,86,93,100,107,112) before editing
[ ] Create recovery snapshots in .pi/recovery/02/before/agents/
[ ] Insert exact note + blank separator after line 14 in each of the 2 files
[ ] Run TILL-DO gates (below) for each file
[ ] Focused diff review (git diff of the 2 files)
[ ] Selective stage ONLY the 2 files; checkpoint commit
[ ] Record commit hash in SCHEDULE.md (Checkpoint Commit col + log)
```

## TILL-DO Gates (must all pass per file before COMPLETE)

1. **Patch-boundary check:** `git diff --numstat agents/deep-research-auditor.md agents/deep-research-finalizer.md`
   → each file shows `2  0`. `git status --porcelain` lists ONLY the 2 task files.
2. **Frontmatter byte-identical:**
   `diff <(sed -n '1,13p' .pi/recovery/02/before/agents/<f>) <(sed -n '1,13p' agents/<f>)` → empty.
3. **Preservation-marker check:** `grep -n '^You are the \*\*' agents/<f>` → present (now line 17).
4. **Note present once:** `grep -c 'Deprecated / Legacy' agents/<f>` → `1`.
5. **Master reference check:** `grep -F 'agents/deep-search-master.md' agents/<f>` → match.
6. **Anchor check (finalizer hazard):** `grep -n 'Deprecated / Legacy' agents/deep-research-finalizer.md`
   → line 15 (note sits between line 13 `---` and the `You are the **...**` paragraph, NOT after a
   body rule). Finalizer body `---` rules count is unchanged vs snapshot:
   `[ "$(grep -c '^---$' .pi/recovery/02/before/agents/deep-research-finalizer.md)" = "$(grep -c '^---$' agents/deep-research-finalizer.md)" ]`.
7. **Out-of-scope check:** `git status --porcelain` does NOT list `agents/deep-search-master.md`
   or any non-task file.

## Success Criteria

- Both files edited; each `git diff --numstat` = `2  0`.
- Post-edit marker checks pass (frontmatter intact, note ×1, paragraph preserved, master reference
  present, finalizer body `---` count unchanged).
- Focused `git diff` review confirms only the 2-line insertion per file.
- Recovery snapshots exist under `.pi/recovery/02/before/agents/`.
- Checkpoint commit created with selective staging of ONLY the 2 files; hash recorded in SCHEDULE.md.

## Files to Create / Modify

- **Modify:** `agents/deep-research-auditor.md`, `agents/deep-research-finalizer.md`.
- **Create (working artifact, not committed):** `.pi/recovery/02/before/agents/<2 files>`.

## Prerequisite Files

- `HANDOFF.md` (read).
- The 2 target files (read top 16 lines each before editing).

## STOP Rules

- STOP if any target file's closing frontmatter `---` is NOT at line 13 or line 15 is NOT a
  `You are the **...**` paragraph (structure drifted) → re-verify and report before editing.
- STOP if the note would land after a body `---` rule in the finalizer (anchor must be line 13).
- STOP if any `git diff --numstat` is not `2  0` (unexpected deletion/modification).
- STOP if frontmatter (lines 1–13) differs from the snapshot, or finalizer body `---` count changes.
- STOP if any file outside the 2-file list appears in `git status` (especially
  `agents/deep-search-master.md`).
- STOP and roll back from `.pi/recovery/02/before/` if any gate fails; do not commit partial/incorrect edits.
