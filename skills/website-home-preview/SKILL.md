---
name: website-home-preview
description: Autonomous high-quality website Home preview flow. Use when the user wants a premium one-page Home preview as a single static index.html, not a full production website/project. Reuses builder and validator, with no human approval gates.
---

# Website Home Preview Skill

Use this skill when the user asks for a website/landing preview, Home Page mockup, or visual direction and wants **one high-quality static `index.html`**, not a full production project.

## Core Idea

The full website pipeline builds a real project. This flow builds only a **premium Home Page preview**.

```txt
website-home-designer
  → website-home-planner
  → builder
  → validator
  → builder fixes only if validator blocks
  → validator final check
```

No human approval gates between steps. The flow is autonomous from briefing to `index.html` unless the briefing is unusable.

## Output Standard

All artifacts live in one predictable directory:

```txt
.pi/previews/<slug>/
├── HOME_DESIGN_OPTIONS.md
├── HOME_PLAN.md
├── TASK_builder.md
├── index.html
└── REVIEW.md              # validator output if it writes one
```

Final user-visible output:

```txt
.pi/previews/<slug>/index.html
```

## When to Use

Use this flow for:

- “faz uma home preview”
- “quero ver como ficaria o site”
- “gera um index.html bonito”
- “faz uma landing só pra preview”
- “sem projeto completo por enquanto”
- “quero aprovar direção visual/copy antes de construir tudo”

Do **not** use this flow for:

- production-ready Next.js projects;
- multi-page websites;
- real forms/integrations/auth/CMS;
- deploy-ready codebases;
- existing app refactors.

Use `website-pipeline` for full production websites.

## Non-Negotiables

- One Home Page only.
- One final HTML file only.
- No Next.js, React, Tailwind build, shadcn, package manager, or build step.
- No human approval gate.
- Do not ask the user to choose a design option; the planner chooses.
- Missing facts become labeled preview placeholders, not blockers.
- Same quality bar as the full website pipeline: premium design, real design references, responsive layout, accessibility, hover/focus states, and coherent copy.

## Step 1 — Home Designer

Launch `website-home-designer`.

Prompt template:

```txt
Create an autonomous Home Page preview design for this briefing:

[USER BRIEFING]

Requirements:
- Output directory: .pi/previews/<slug>/
- Write .pi/previews/<slug>/HOME_DESIGN_OPTIONS.md
- Create exactly 3 high-quality design directions and a recommended direction.
- Use design-catalog references when useful.
- Scope is only one Home Page, not a full site.
- No human approval. Make labeled assumptions if details are missing.
```

Expected output:

```txt
.pi/previews/<slug>/HOME_DESIGN_OPTIONS.md
```

## Step 2 — Home Planner

Launch `website-home-planner` after the design options exist.

Prompt template:

```txt
Read .pi/previews/<slug>/HOME_DESIGN_OPTIONS.md and create the autonomous execution plan for a single-file Home Page preview.

Requirements:
- Choose or fuse the best design direction without asking the user.
- Generate final preview copy and section structure.
- Write .pi/previews/<slug>/HOME_PLAN.md
- Write .pi/previews/<slug>/TASK_builder.md for the existing builder agent.
- The builder output must be exactly .pi/previews/<slug>/index.html
- No full project, no package.json, no framework, no build step.
```

Expected outputs:

```txt
.pi/previews/<slug>/HOME_PLAN.md
.pi/previews/<slug>/TASK_builder.md
```

## Step 3 — Builder

Use the existing `builder` agent by default. Use `builder-heavy` only if the briefing demands unusually high visual complexity or if builder fails.

Prompt template:

```txt
Implement the task in .pi/previews/<slug>/TASK_builder.md.

Hard constraints:
- Create or replace only .pi/previews/<slug>/index.html
- Do not create a project or any extra files.
- Follow HOME_PLAN.md and HOME_DESIGN_OPTIONS.md exactly.
- Run the validation commands listed in TASK_builder.md.
```

Expected output:

```txt
.pi/previews/<slug>/index.html
```

## Step 4 — Validator

Use the existing `validator` with static-preview scope.

Prompt template:

```txt
Validate the static Home preview at .pi/previews/<slug>/index.html.

Read:
- .pi/previews/<slug>/HOME_DESIGN_OPTIONS.md
- .pi/previews/<slug>/HOME_PLAN.md
- .pi/previews/<slug>/index.html

Validate:
- exactly one index.html output, no extra project files required;
- semantic HTML structure;
- inline CSS present;
- responsive layout rules;
- accessible landmarks/headings/buttons/links;
- visible focus states;
- reduced-motion handling;
- no fake unsupported factual claims presented as facts;
- visual/content alignment with HOME_PLAN.md.

If you write a report, write .pi/previews/<slug>/REVIEW.md.
Return PASS, CONDITIONAL, or REJECT with concrete fixes.
```

## Step 5 — Autonomous Fix Loop

If validator returns:

| Verdict | Action |
|---|---|
| PASS | Stop and report the preview path. |
| CONDITIONAL | Run `builder` once with validator fixes, then validate again. |
| REJECT | Run `builder` once if fixes are concrete and within `index.html`; otherwise stop blocked with reason. |

Maximum fix attempts: **1**. After one failed fix attempt, stop and report the blocker.

## Final Response Format

```txt
Home preview created: .pi/previews/<slug>/index.html
Artifacts:
- HOME_DESIGN_OPTIONS.md
- HOME_PLAN.md
- TASK_builder.md
- REVIEW.md if generated
Validation: PASS/CONDITIONAL/REJECT
Notes: [only important assumptions or blockers]
```
