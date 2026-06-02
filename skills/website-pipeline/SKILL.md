---
name: website-pipeline
description: Website project orchestration pipeline. Use when the user asks to build, design, or modify a website. Defines the correct agent execution order — designer first, then content writer, then planner, then builder. Load this BEFORE starting any website project.
---

# Website Pipeline — Agent Execution Order

For website projects, the pipeline has a **different order** from the generic `scout → planner → builder` flow. The planner comes **after** content, not before.

## Pipeline

```
website-designer → seo-content-writer → planner → builder → website-polisher → validator
```

| Step | Agent | Produces | Notes |
|------|-------|----------|-------|
| 1 | **website-designer** | `.pi/plans/DESIGN_PLAN.md` | Visual spec, design tokens, UX hierarchy, animations |
| 2 | **seo-content-writer** | `.pi/plans/CONTENT_PLAN.md` | Copy, meta tags, schema markup. Reads DESIGN_PLAN.md |
| 3 | **planner** | `PLAN_FULL.md` + `SCHEDULE.md` + `TASKS/` | Reads BOTH plans. Then get user approval |
| 4 | **builder** | Code implementation | Follows SCHEDULE.md |
| 5 | **website-polisher** | Visual refinements | Adds hover/focus states, a11y, polish |
| 6 | **validator** | Quality gate | Compilation, types, a11y |

## CRITICAL Rules

1. **Planner MUST receive BOTH `DESIGN_PLAN.md` and `CONTENT_PLAN.md`** before generating tasks
2. **Do NOT run planner before content is ready** — seo-content-writer must finish first
3. **website-polisher runs AFTER builder**, not before — it refines what's already built
4. **designer does NOT write final copy** — placeholders only, marked as `[SEO Content Writer — purpose: ...]`

## When to Skip Steps

| Situation | Action |
|-----------|--------|
| User already has DESIGN_PLAN.md | Skip designer, start with seo-content-writer |
| User already has both plans | Skip designer + writer, go straight to planner |
| Small tweak (1 page, <5 components) | Skip planner, use direct builder |
| No design changes, only copy update | Skip designer, update CONTENT_PLAN.md directly |

## Required Skills Per Step

| Step | Skills to Load |
|------|---------------|
| website-designer | `/skill:design-catalog` for brand references |
| seo-content-writer | Reads DESIGN_PLAN.md (no extra skill needed) |
| planner | `/skill:website-stack` for tech conventions |
| builder | `/skill:website-stack` for file structure, components |
| website-polisher | `/skill:design-catalog` for design system consistency |
| validator | No skill needed |
