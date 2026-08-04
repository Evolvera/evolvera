# Task 02: Make creative direction an additive post-design stage

**Agent**: builder  
**Why**: The order/authority contract spans synchronized system prompts, two workflow skills, and producer/consumer schemas that must change atomically.  
**Goal**: Both website flows produce baseline design first and, only on explicit activation, produce a design-grounded creative interaction addendum that downstream implementation and review stages enforce.

## Read
- `SYSTEM.md` and `config/SYSTEM.md` — synchronized global website routing.
- `skills/website-pipeline/SKILL.md` — production stages, prompts, skip rules, and handoffs.
- `skills/website-home-preview/SKILL.md` — Home stages, static constraints, and complete review loop.
- `agents/website-designer.md`, `agents/website-home-designer.md`, and `agents/website-creative.md` — producer schemas and authority.
- `agents/website-home-planner.md`, `agents/seo-content-writer.md`, and `agents/website-polisher.md` — affected downstream contracts.
- `skills/design-catalog/SKILL.md:153-180` — responsibility table and chain.
- `skills/creative-toolkit/SKILL.md`, `skills/creative-toolkit/tool-index.json`, and `skills/creative-catalog/SKILL.md` — exact selective-retrieval/tool policy.
- `agents/builder-home.md`, `agents/website-polisher-home.md`, `agents/validator-home.md` — confirm no pre-designer semantics; leave unchanged unless this focused check disproves the evidence.

## Change
- `SYSTEM.md` — MODIFY — production/Home routing sentence only: designer before optional creative.
- `config/SYSTEM.md` — MODIFY — identical synchronized routing change.
- `agents/website-designer.md` — MODIFY — remove creative intake/translation; add designer-owned baseline motion and Creative Opportunity Map to `DESIGN_PLAN.md`.
- `agents/website-home-designer.md` — MODIFY — remove creative intake/translation; add the map to `HOME_DESIGN_OPTIONS.md` within static-preview constraints.
- `agents/website-creative.md` — MODIFY — run after design; add `jina_read`; consume design, catalog, and toolkit; emit only a mapped additive addendum or rejection/`DESIGN_CONFLICT`.
- `agents/website-home-planner.md` — MODIFY — carry the optional post-design addendum into the existing Home plan/builder task without redesign.
- `agents/seo-content-writer.md` — MODIFY — correct the stage label while preserving design/brief-only inputs.
- `agents/website-polisher.md` — MODIFY — directly read the optional addendum and audit it without overriding design/content authority.
- `skills/website-pipeline/SKILL.md` — MODIFY — reorder stages/prompts, pass `DESIGN_PLAN.md` to creative, preserve activation/filename/skip behavior, and pass the addendum downstream.
- `skills/website-home-preview/SKILL.md` — MODIFY — reorder stages/prompts, pass `HOME_DESIGN_OPTIONS.md` to creative, enforce native-only selection, and preserve the screenshot/polish/validation loop.
- `skills/design-catalog/SKILL.md` — MODIFY — reflect designer ownership followed by optional additive creative direction.

## Acceptance
- [ ] Every authoritative production/Home sequence places the respective designer before optional `website-creative`; explicit activation terms are preserved and premium/modern/beautiful remains insufficient.
- [ ] Both design artifacts include a Creative Opportunity Map with existing expressive zones, protected zones, and base motion language; designers retain UX, trust/conversion hierarchy, layout, tokens, components/states, responsive behavior, accessibility, and asset direction.
- [ ] `website-creative` requires the mode’s design artifact, preserves both existing creative filenames, and maps every intervention to an existing page/section/component, one purpose class (`orientation | continuity | state feedback | emphasis | narrative`), and a user/brand purpose.
- [ ] Creative never rewrites hierarchy, tokens, content, layout, accessibility, or conversion behavior. A mechanic needing such change is downgraded/rejected or reported as `DESIGN_CONFLICT` against a named design anchor.
- [ ] Selection is catalog WHAT first and toolkit HOW/WHEN second. `jina_read` is limited to official URLs for the 1–2 shortlisted tools before exact package/API claims; inaccessible facts remain `UNKNOWN`, and downstream re-verifies install/import/version before dependency mutation.
- [ ] Production and Home planner/builders/polishers/validators receive/check the optional addendum; content writers continue through design intent and do not independently reinterpret mechanics.
- [ ] Home creative output allows only native CSS/HTML/JS compatible with one self-contained `index.html`; Motion, GSAP, Three.js, packages, frameworks, and external runtimes are prohibited.

## Constraints
- Preserve unrelated intake, content, routing, asset provenance, no-fake-proof, screenshot, polish, validation, and the one-attempt Home fix loop.
- Preserve normal scroll, semantic DOM order, keyboard/touch parity, unobscured focus, conventional links/forms/CTAs, static content, progressive enhancement, exact filenames, and p75 LCP ≤2.5s / INP ≤200ms / CLS ≤0.1.
- Reject decorative-only animation, global repeated fade-up/stagger, gratuitous parallax/cursor/magnetic/gradient motion, hover-only content, drag-only operation, scroll hijacking, wheel/swipe interception, and motion-gated CTA/forms/navigation/proof.
- Reduced motion replaces/removes parallax, scroll-linked, large transform/layout, and autoplay motion with a composed static/opacity state; content/actions remain. Prefer transform/opacity; layout/paint-heavy properties require runtime trace evidence.
- Do not modify catalog patterns, installer, generic planner/builder/validator agents, Home builder/polisher/validator agents, dependencies, websites, or unrelated files. No broad formatting/codemod.

## Patch Anchors
- `SYSTEM.md` / `config/SYSTEM.md`: only the “Production website design/build/modify” routing sentence; keep copies byte-identical.
- `website-designer.md`: pipeline line, Evidence/References intake, deliverable creative-translation field, motion/map handoff, checklist. Remove every requirement to read `CREATIVE_DIRECTION.md`.
- `website-home-designer.md`: creative pre-read rule and `## 1.5 Creative Direction Intake`; replace with `## 1.5 Creative Opportunity Map`. Remove every requirement to read `HOME_CREATIVE_DIRECTION.md`.
- `website-creative.md`: frontmatter description/tools; pipeline/inputs; output sections; selection/tool/authority boundaries; Home mode; completion. Its addendum sections cover design authority, map intake, mapped intervention table, purpose, pattern provenance, tool/evidence/status, storyboard/input, progressive/static/reduced-motion behavior, performance/CWV, rejected options, conflicts, and downstream checks.
- `website-pipeline/SKILL.md`: Pipeline table; optional creative section/prompt; critical rules; designer/polisher prompts; skip table; required-skill table.
- `website-home-preview/SKILL.md`: Core flow; optional creative section/prompt; designer/planner/builder/polisher/validator prompts. Preserve Steps 5–9 mechanics.
- `design-catalog/SKILL.md`: responsibility split, “How It Works,” and “New website from scratch” chain only.
- Preserve current direct Home addendum reads in the Home planner/workflow downstream prompts; change only their authority from pre-design thesis to mapped additive mechanics.

## Validation
- `pi_validate_skill(skillPath="/Users/j.henrique/.pi/agent/skills/website-pipeline")`, then the same tool for `website-home-preview` and `design-catalog` — each returns `VALID`.
- `cmp -s SYSTEM.md config/SYSTEM.md` — system copies remain byte-identical.
- `python3 - <<'PY'
from pathlib import Path
import re
S=lambda p:Path(p).read_text()
sys=S('SYSTEM.md'); prod=S('skills/website-pipeline/SKILL.md'); home=S('skills/website-home-preview/SKILL.md'); creative=S('agents/website-creative.md'); d=S('agents/website-designer.md'); hd=S('agents/website-home-designer.md'); hp=S('agents/website-home-planner.md'); seo=S('agents/seo-content-writer.md'); polish=S('agents/website-polisher.md'); stack=S('skills/website-stack/SKILL.md')
flags=re.I|re.S
route=next(x for x in sys.splitlines() if x.startswith('- **Production website design/build/modify:**'))
assert route.find('website-designer') < route.find('website-creative') < route.find('content')
assert re.search(r'Strategy Intake.*?website-designer.*?website-creative.*?seo-content-writer',prod,flags)
assert re.search(r'Compact Strategy Intake.*?website-home-designer.*?website-creative.*?seo-content-writer-home',home,flags)
assert re.search(r'website-designer.{0,160}website-creative.{0,160}seo-content-writer',seo,flags)
assert 'CREATIVE_DIRECTION.md' not in d and 'HOME_CREATIVE_DIRECTION.md' not in hd
for text in (d,hd): assert all(x in text for x in ('Creative Opportunity Map','protected','base motion'))
for token in ('DESIGN_PLAN.md','HOME_DESIGN_OPTIONS.md','/skill:creative-catalog','/skill:creative-toolkit','DESIGN_CONFLICT','orientation','continuity','state feedback','emphasis','narrative','jina_read'): assert token in creative,token
for token in ('HOME_PREVIEW_MODE','native CSS','Motion','GSAP','Three'): assert token in creative and token in home,token
assert 'HOME_CREATIVE_DIRECTION.md' in hp and 'CREATIVE_DIRECTION.md' in polish
assert 'npm install motion' in stack and 'motion/react' in stack and 'framer-motion' not in stack.lower()
PY` — stage, authority, input, Home restriction, and Motion assertions pass.
- `! grep -inE 'before (the )?website designers|website-creative.*→.*website-(home-)?designer|pass it to the designer|designer reads and translates' SYSTEM.md config/SYSTEM.md agents/website-creative.md agents/website-designer.md agents/website-home-designer.md skills/website-pipeline/SKILL.md skills/website-home-preview/SKILL.md skills/design-catalog/SKILL.md` — stale pre-designer/translation claims are absent.
- `grep -inE 'premium.*modern.*beautiful|modern.*beautiful' skills/website-pipeline/SKILL.md skills/website-home-preview/SKILL.md agents/website-creative.md` plus focused reading — generic style terms remain explicitly insufficient for activation.
- `grep -nE 'LCP.*2\.5|INP.*200|CLS.*0\.1|reduced.motion|scroll hijack|normal scroll' agents/website-creative.md skills/website-pipeline/SKILL.md skills/website-home-preview/SKILL.md` — core safety guards remain observable.
- `git diff --check -- SYSTEM.md config/SYSTEM.md agents/website-creative.md agents/website-designer.md agents/website-home-designer.md agents/website-home-planner.md agents/seo-content-writer.md agents/website-polisher.md skills/website-pipeline/SKILL.md skills/website-home-preview/SKILL.md skills/design-catalog/SKILL.md` — clean patch formatting.
- `git status --short` plus focused diff/staging review — only the 11 source files and named recovery mirror belong to this task; unrelated dirty/untracked paths remain untouched.

## Stop If
- Any artifact filename must change, a supported non-creative journey would be removed, or a partial edit cannot keep both flows coherent.
- Installer/dependency/website changes appear necessary, or an excluded downstream agent needs editing without a concrete stale claim.
- A task-owned file is unexpectedly dirty or a preservation-critical section lacks a safe patch anchor; report before editing.

## Checkpoint
- Recovery snapshot: required before editing at `.pi/recovery/creative-interaction-pipeline-task-02/before/<relative-path>` for each of the 11 owned existing files; do not copy unrelated files.
- Commit scope: `SYSTEM.md`, `config/SYSTEM.md`, `agents/website-creative.md`, `agents/website-designer.md`, `agents/website-home-designer.md`, `agents/website-home-planner.md`, `agents/seo-content-writer.md`, `agents/website-polisher.md`, `skills/website-pipeline/SKILL.md`, `skills/website-home-preview/SKILL.md`, `skills/design-catalog/SKILL.md`
