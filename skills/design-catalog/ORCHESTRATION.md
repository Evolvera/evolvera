# Website Builder Agent Chain — Orchestration Guide

This document describes how the website builder agents communicate and the contract between them.

## Agent Contract

### Communication Contract

Agents communicate **via filesystem artifacts**. Each producer agent writes a plan file that the next consumer agent reads.

| File | Created By | Read By | Purpose |
|------|-----------|---------|---------|
| `DESIGN_PLAN.md` | `website-designer` | `builder`, `website-polisher` | Detailed design + implementation plan |
| `POLISH_PLAN.md` | `website-polisher` (READ-ONLY) | `builder`, `validator` | UI/UX polish instructions (file, old_string, new_string per fix) |
| `REVIEW.md` | `validator` | user, PI principal | Quality gate verdict (PASS/CONDITIONAL/REJECT) |
| `TILL-DO.md` | builder, polisher | themselves | Pre-flight sanity gates |
| `TODO.md` | builder, polisher | themselves | Atomic execution steps |

### File Naming Conventions

- **DESIGN_PLAN.md** — Output of website-designer (lives in project root)
- **POLISH_PLAN.md** — Output of website-polisher (lives in project root; NOT "POLISH_NOTES")
- **REVIEW.md** — Output of validator (lives in project root)
- **TILL-DO.md**, **TODO.md** — Lifecycle artifacts for builder/polisher

### Branch Conventions

- Builder creates: `agent/<timestamp>-website-<slug>`
- Polisher edits on the **same branch** (never creates a new branch)
- Validator validates the final branch

## Chain Sequence

```
┌─────────────────────────────────────────────────────────────────────────┐
│  website-designer                                                       │
│  Input: User briefing (text or /website-brief output)                  │
│  Output: DESIGN_PLAN.md in project root                                │
│  Tools: read, grep, find, ls, bash, write                             │
│  Lifecycle: TILL-DO → TODO → Write DESIGN_PLAN.md → Cleanup           │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  builder [PRE-EXISTENT]                                                 │
│  Input: DESIGN_PLAN.md + briefing                                      │
│  Output: Code in branch agent/<timestamp>-website-<slug>               │
│  Tools: read, grep, find, ls, bash, write, edit, bash (git)           │
│  Lifecycle: TILL-DO → TODO → Implement → Final Verification → Cleanup  │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  validator [PRE-EXISTENT]                                               │
│  Input: Branch code + DESIGN_PLAN.md                                   │
│  Output: REVIEW.md (PASS / CONDITIONAL / REJECT)                       │
│  Tools: read-only + write for REVIEW.md                                │
│  Gates: compilation, types, imports, structure, tests                  │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  website-polisher                                                       │
│  Input: DESIGN_PLAN.md + branch code (read-only)                      │
│  Output: POLISH_PLAN.md in project root                                │
│  Tools: read, grep, find, ls, bash, write (NO edit!)                  │
│  Lifecycle: TILL-DO → TODO → Audit → Write POLISH_PLAN.md → Cleanup   │
│  Rule: READ-ONLY — NEVER edits source code                            │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  builder [PRE-EXISTENT]                                                 │
│  Input: POLISH_PLAN.md                                                 │
│  Output: Code with visual fixes applied (same branch)                  │
│  Tools: read, grep, find, ls, bash, write, edit, bash (git)           │
│  Lifecycle: TILL-DO → TODO → Apply fixes → Final Verification          │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  validator [PRE-EXISTENT]                                               │
│  Input: Final branch code + POLISH_PLAN.md                             │
│  Output: REVIEW.md (final verdict)                                     │
│  Gates: tests, accessibility, security, visual quality                  │
└────────────────────────────────┴────────────────────────────────────────┘
```

## Mandatory Rules

1. **Polisher runs AFTER first validator approval**: The polisher should only run if the validator gave PASS or CONDITIONAL (not REJECT). If REJECT, the builder must fix the underlying issues first.

2. **Polisher is READ-ONLY**: The polisher NEVER edits source code. It only reads code and writes `POLISH_PLAN.md`. The builder executes the polish plan.

3. **Builder and Validator are pre-existing**: These agents are NOT modified by this chain. They are generic agents that receive specific inputs.

4. **Designer writes no code**: The website-designer ONLY produces `DESIGN_PLAN.md`. It never writes TSX, CSS, or config files.

5. **File location**: All plan artifacts (DESIGN_PLAN.md, POLISH_PLAN.md, REVIEW.md) live in the **project root** (not in subdirectories).

6. **Branch isolation**: The builder creates an isolated branch. The polisher operates on that branch without creating a new one.

## Context Passing

The PI principal passes context between agents by:

1. **Designer → Builder**: Pass the path to `DESIGN_PLAN.md` and the briefing text
2. **Builder → Validator**: Pass the branch name and the path to `DESIGN_PLAN.md`
3. **Validator → Polisher**: Pass the branch name, path to `DESIGN_PLAN.md`, and the validator's verdict
4. **Polisher → Builder**: Pass the path to `POLISH_PLAN.md`
5. **Builder → Validator**: Pass the branch name and path to `POLISH_PLAN.md`

## Error Handling in Chain

| Failure Point | Recovery |
|---------------|----------|
| Designer fails to generate plan | Retry with clarifications from user |
| Builder fails (compilation error) | Builder self-corrects; if max_turns exceeded, report to user |
| Validator REJECT | Builder fixes issues; re-run validator |
| Polisher exceeds max_turns | Prioritize: Critical (a11y, states) → High → Medium; document pending |
| Builder fails to apply polish | Builder skips unapplyable fixes and reports |

## Design Catalog Dependency

The chain depends on the `design-catalog` skill being available:
- Designer loads: `design-index.json` + chosen `DESIGN.md` files
- Polisher reads: `DESIGN_PLAN.md` to understand design intent

If the skill is unavailable, the designer falls back to general design knowledge (Tailwind defaults, shadcn/ui patterns).
