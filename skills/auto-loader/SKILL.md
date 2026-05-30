---
name: auto-loader
description: Automatically loads full skill content when a task requires specialized workflows. Use BEFORE any task that involves building, planning, scouting, or any other skill. Do NOT act on skill descriptions alone — load the complete instructions first.
---

# Auto-Loader — Full Skill Injection

## Rule

When the current task matches ANY skill, you MUST load its complete content before proceeding. The description that stays in context by default is NOT enough.

## How to Use

1. Identify which skills are relevant to the task:
   - Building code → `/skill:builder`
   - Planning architecture → `/skill:planner`
   - Exploring codebase → `/skill:scout`
   - Website projects → `/skill:website-stack`
   - Design systems → `/skill:design-catalog`
   - Any other skill → `/skill:<name>`

2. Load ALL relevant skills in parallel:
   ```
   /skill:builder
   /skill:planner
   /skill:scout
   ```

3. After loading, you now have the FULL instructions. Follow them exactly.

## Critical Reminders from Loaded Skills

| Skill | Key Rule You Must Remember |
|-------|---------------------------|
| **builder** | Runs on a SMALL model. Always tell it: what files to READ, what PATTERNS to follow, and how to VERIFY. Split into atomic tasks. |
| **planner** | ALWAYS do a pre-plan first. Get user approval before running the full planner. Generates PLAN_FULL + SCHEDULE + TASKS. |
| **scout** | READ-ONLY. Never modifies code. Returns evidence report + checkpoint for handoff. |
| **website-stack** | Next.js App Router + Tailwind v3 + Framer Motion + shadcn/ui. Follow file structure and code conventions. |
| **design-catalog** | Reference real-world brands (Stripe, Linear, Apple). Use design tokens, not hardcoded values. |

## When to Skip

- Trivial edits (< 5 lines, 1 file) → just use `edit`
- Simple `read` or `bash` queries → no skill needed
- You've already loaded the skill in this session → don't reload unless context was lost

## Anti-Pattern

❌ "I'll use the builder skill because the description says it's for code changes."

✅ "Loading /skill:builder to get the full instructions on how to handle small models..."
