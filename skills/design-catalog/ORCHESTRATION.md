# Website Builder Agent Chain — Orchestration Guide

This document describes how the website builder agents communicate and the contract between them.

## Agent Contract

### Communication Contract

Agents communicate **via filesystem artifacts**. Each producer agent writes a plan file that the next consumer agent reads.

| File | Created By | Read By | Purpose |
|------|-----------|---------|---------|
| `DESIGN_PLAN.md` | `website-designer` | `seo-content-writer`, `planner`, `builder`, `website-polisher` | Detailed design + UX strategy + SEO guidance |
| `CONTENT_PLAN.md` | `seo-content-writer` | `planner`, `builder`, `website-polisher`, `validator` | All website copy, meta tags, microcopy, alt text, schema markup |
| Planner Phase Plan | `planner` | `builder` | Implementation phase instructions passed as prompt context by PI principal |
| `POLISH_PLAN.md` | `website-polisher` (READ-ONLY) | `builder`, `validator` | UI/UX polish instructions (file, old_string, new_string per fix) |
| `REVIEW.md` | `validator` | user, PI principal | Quality gate verdict (PASS/CONDITIONAL/REJECT) |
| `TILL-DO.md` | builder, polisher, seo-content-writer | themselves | Pre-flight sanity gates |
| `TODO.md` | builder, polisher, seo-content-writer | themselves | Atomic execution steps |

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
│  Note: Visual + UX strategy — no technical stack or implementation     │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  seo-content-writer                                                     │
│  Input: DESIGN_PLAN.md + User briefing                                 │
│  Output: CONTENT_PLAN.md in project root                               │
│  Tools: read, grep, find, ls, bash, write                             │
│  Lifecycle: TILL-DO → TODO → Write CONTENT_PLAN.md → Human Approval    │
│  Rule: MUST pause for human approval before proceeding                 │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ (after human ✅)
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  planner [PRE-EXISTENT]                                                 │
│  Input: DESIGN_PLAN.md + CONTENT_PLAN.md + /skill:website-stack       │
│  Output: Phase plan (passed as prompt context to builder)              │
│  Rule: Loads website-stack skill for technical context                 │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ [prompt context]
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  builder [PRE-EXISTENT]                                                 │
│  Input: DESIGN_PLAN.md + CONTENT_PLAN.md + planner phase plan + briefing│
│  Output: Code in branch agent/<timestamp>-website-<slug>               │
│  Tools: read, grep, find, ls, bash, write, edit, bash (git)            │
│  Lifecycle: TILL-DO → TODO → Implement → Final Verification → Cleanup   │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  validator [PRE-EXISTENT]                                               │
│  Input: Branch code + DESIGN_PLAN.md + CONTENT_PLAN.md                 │
│  Output: REVIEW.md (PASS / CONDITIONAL / REJECT)                       │
│  Tools: read-only + write for REVIEW.md                                │
│  Gates: compilation, types, imports, structure, tests, copy check      │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  website-polisher                                                       │
│  Input: DESIGN_PLAN.md + CONTENT_PLAN.md + branch code (read-only)    │
│  Output: POLISH_PLAN.md in project root                                │
│  Tools: read, grep, find, ls, bash, write (NO edit!)                  │
│  Lifecycle: TILL-DO → TODO → Audit → Write POLISH_PLAN.md → Cleanup   │
│  Rule: READ-ONLY — NEVER edits source code                            │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  builder [PRE-EXISTENT]                                                 │
│  Input: POLISH_PLAN.md + CONTENT_PLAN.md (context reference)          │
│  Output: Code with visual fixes applied (same branch)                  │
│  Tools: read, grep, find, ls, bash, write, edit, bash (git)           │
│  Lifecycle: TILL-DO → TODO → Apply fixes → Final Verification          │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  validator [PRE-EXISTENT]                                               │
│  Input: Final branch code + DESIGN_PLAN.md + CONTENT_PLAN.md           │
│  Output: REVIEW.md (final verdict)                                     │
│  Gates: tests, accessibility, security, visual quality, content       │
└────────────────────────────────┴────────────────────────────────────────┘
```

## Mandatory Rules

1. **Polisher runs AFTER first validator approval**: The polisher should only run if the validator gave PASS or CONDITIONAL (not REJECT). If REJECT, the builder must fix the underlying issues first.

2. **Polisher is READ-ONLY**: The polisher NEVER edits source code. It only reads code and writes `POLISH_PLAN.md`. The builder executes the polish plan.

3. **Builder and Validator are pre-existing**: These agents are NOT modified by this chain. They are generic agents that receive specific inputs.

4. **Designer writes no code**: The website-designer ONLY produces `DESIGN_PLAN.md`. It never writes TSX, CSS, or config files.

5. **File location**: All plan artifacts (DESIGN_PLAN.md, POLISH_PLAN.md, REVIEW.md) live in the **project root** (not in subdirectories).

6. **Branch isolation**: The builder creates an isolated branch. The polisher operates on that branch without creating a new one.

7. **Planner loads website-stack skill**: The planner MUST load `/skill:website-stack` before producing the phase plan to ensure technical accuracy.

## Context Passing

The PI principal passes context between agents by:

1. **Designer → SEO Content Writer**: Pass the path to `DESIGN_PLAN.md` and the briefing text
2. **SEO Content Writer → Planner** (after approval): Pass the paths to `CONTENT_PLAN.md`, `DESIGN_PLAN.md`, and the instruction to load `/skill:website-stack`
3. **Planner → Builder**: Pass the planner's phase plan as inline prompt context
4. **Builder → Validator**: Pass the branch name, path to `DESIGN_PLAN.md`, and path to `CONTENT_PLAN.md`
5. **Validator → Polisher**: Pass the branch name, path to `DESIGN_PLAN.md`, path to `CONTENT_PLAN.md`, and the validator's verdict
6. **Polisher → Builder**: Pass the path to `POLISH_PLAN.md`
7. **Builder → Validator**: Pass the branch name and path to `POLISH_PLAN.md`

### Planner-Specific Context Passing

The `planner` is invoked by the PI principal after human approval of `CONTENT_PLAN.md`.

**Prompt format for planner invocation:**
```
Agent(subagent_type="planner", prompt=
"You are planning the implementation of a website.\n\n"
"Read these two artifacts from the project root:\n"
"1. DESIGN_PLAN.md — visual design specification\n"
"2. CONTENT_PLAN.md — all website copy and SEO metadata\n\n"
"Load the website-stack skill for technical context: /skill:website-stack\n\n"
"Produce a phase-based implementation plan covering:\n"
"- Phase 0: Project scaffolding (Next.js init, Tailwind v3, shadcn/ui, Framer Motion setup)\n"
"- Phase 1: Global layout (root layout, fonts, metadata, globals.css, tailwind.config.ts)\n"
"- Phase 2: Shared components (Navbar, Footer, Container, ui primitives)\n"
"- Phase 3: Page sections per page (Hero, Features, etc.)\n"
"- Phase 4: Interactions, animations, responsive polish\n"
"- Phase 5: SEO finalization (meta tags, schema markup, alt text, sitemap)\n\n"
"Return the plan as structured markdown. Do NOT write code.")
```

**Prompt format for builder invocation (including planner output):**
```
Agent(subagent_type="builder", prompt=
"Implement the website according to these artifacts and plan.\n\n"
"ARTIFACTS (read from project root):\n"
"- DESIGN_PLAN.md\n"
"- CONTENT_PLAN.md\n\n"
"IMPLEMENTATION PLAN (follow this order and these phases):\n"
"<paste planner output here>\n\n"
"Rules:\n"
"- Follow the implementation plan phases in order.\n"
"- Use DESIGN_PLAN.md for visual specs and CONTENT_PLAN.md for all copy.\n"
"- If the plan conflicts with an artifact, prefer the artifact and note the discrepancy.\n")
```

## Builder Content Contract

When the builder receives `DESIGN_PLAN.md`, `CONTENT_PLAN.md`, and the planner's phase plan:
- The builder reads `DESIGN_PLAN.md` for **visual design**, layout, components, hierarchy, and accessibility specs
- The builder reads `CONTENT_PLAN.md` for **ALL textual content** (headlines, body copy, CTAs, meta tags, microcopy, alt text, schema markup)
- The builder follows the **planner's phase plan** for implementation order (scaffolding → layout → sections → interactions → SEO)
- The builder **MUST prioritize** `CONTENT_PLAN.md` copy over any generated placeholders
- If `CONTENT_PLAN.md` is **missing**, the builder falls back to current behavior (generic placeholders or self-generated copy)
- If the planner's phase plan is **missing**, the builder self-organizes using standard Next.js scaffolding order
- The builder **MUST respect** the language specified in `CONTENT_PLAN.md`'s Project Context section

## Human Approval Gate

The `seo-content-writer` is the **ONLY agent** in the website chain with a **mandatory human approval step**.

**Flow:**
1. `seo-content-writer` generates `CONTENT_PLAN.md`
2. `seo-content-writer` **pauses** and presents the full plan to the user
3. User reviews and either:
   - **Approves** → PI principal proceeds to invoke `builder` with both artifacts
   - **Requests changes** → `seo-content-writer` regenerates specific sections and re-presents
4. The PI principal **MUST NOT auto-advance** to the builder step until the user explicitly approves

**This is a design invariant, not a configuration.** It ensures brand safety and prevents costly post-build content revisions.

## Error Handling in Chain

| Failure Point | Recovery |
|---------------|----------|
| Designer fails to generate plan | Retry with clarifications from user |
| Builder fails (compilation error) | Builder self-corrects; if max_turns exceeded, report to user |
| Validator REJECT | Builder fixes issues; re-run validator |
| Polisher exceeds max_turns | Prioritize: Critical (a11y, states) → High → Medium; document pending |
| Builder fails to apply polish | Builder skips unapplyable fixes and reports |
| Planner fails to generate plan | PI principal falls back to passing artifacts directly to builder with generic step-by-step instruction |

## Design Catalog Dependency

The chain depends on the `design-catalog` skill being available:
- Designer loads: `design-index.json` + chosen `DESIGN.md` files
- Polisher reads: `DESIGN_PLAN.md` to understand design intent

If the skill is unavailable, the designer falls back to general design knowledge (Tailwind defaults, shadcn/ui patterns).
