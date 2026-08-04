# Task 01: Establish the creative tool-selection foundation

**Agent**: builder-design  
**Why**: This is a bounded declarative selector/policy model with an exact machine-readable oracle.  
**Goal**: Add an index-first HOW/WHEN creative toolkit, make the creative catalog website-creative-first, and replace stale default Framer Motion guidance with conditional current Motion guidance.

## Read
- `skills/creative-catalog/SKILL.md` — preserve the WHAT-pattern algorithm and guardrails.
- `skills/creative-catalog/creative-index.json` — preserve all 12 pattern records unchanged.
- `skills/website-stack/SKILL.md` — preserve all non-animation website conventions.
- `install.sh:56-63` — validate recursive skill copying without editing it.
- `extensions/pi-tool-expert-helper.ts:13-145` — existing validation/discovery tools.

## Change
- `skills/creative-toolkit/SKILL.md` — CREATE — website-creative-only HOW/WHEN selection workflow, index-first retrieval, tool ladder, one-runtime rule, verification gates, Home native-only policy, and safety gates.
- `skills/creative-toolkit/tool-index.json` — CREATE — five machine-readable tool records linked to profiles.
- `skills/creative-toolkit/profiles/native-web-platform.md` — CREATE — native CSS/web-platform profile.
- `skills/creative-toolkit/profiles/motion-react.md` — CREATE — Motion core for React profile and Motion+ restriction.
- `skills/creative-toolkit/profiles/view-transitions-api.md` — CREATE — progressive native continuity profile.
- `skills/creative-toolkit/profiles/gsap-scrolltrigger.md` — CREATE — conditional GSAP/React/ScrollTrigger profile.
- `skills/creative-toolkit/profiles/threejs-webgl.md` — CREATE — spatial-only, partially verified Three.js/WebGL profile.
- `skills/creative-catalog/SKILL.md` — MODIFY — make the catalog post-design WHAT selection primarily for website-creative; preserve its index, matching algorithm, guardrails, and pattern files.
- `skills/website-stack/SKILL.md` — MODIFY — use “Motion for React,” `npm install motion`, and `import { motion } from "motion/react"`; make CSS/platform first and Motion conditional while preserving unrelated conventions.

## Acceptance
- [ ] Toolkit retrieval is `tool-index.json` first and only 1–2 shortlisted profiles; it contains no dependency/source code and identifies `website-creative` as its only runtime consumer.
- [ ] The index has exactly the five approved unique slugs and all required fields; every referenced profile exists.
- [ ] Three.js is `partial`; exact install/import and licensing remain `UNKNOWN`. Motion/GSAP/Three licensing/payment remain `UNKNOWN` unless verified from an official source during execution.
- [ ] The ladder is native first → conditional Motion core → simple progressive View Transitions → justified complex GSAP/ScrollTrigger → spatial-essential Three.js. “No tool” is valid.
- [ ] At most one primary JavaScript runtime is allowed unless two disjoint capabilities are justified; Motion and GSAP never implement the same mechanic. Motion+ is paid/proprietary and unavailable without explicit purchase/authorization.
- [ ] Home Preview allows only native CSS/HTML/JS and rejects Motion, GSAP, Three.js, packages, frameworks, and external runtimes.
- [ ] `website-stack` has no `framer-motion` wording and does not mandate an animation dependency; its Next.js, Tailwind v3, shadcn, image/font, accessibility, and server/client conventions remain intact.

## Constraints
- Do not modify `skills/creative-catalog/creative-index.json`, `skills/creative-catalog/patterns/*.md`, installers, manifests, dependencies, configuration, or websites.
- Do not present vendor bundle claims as measured target-runtime evidence. Preserve package/API/licensing uncertainty instead of guessing.
- Preserve progressive enhancement, static content, normal interaction, keyboard/touch parity, visible focus, reduced-motion composition, p75 LCP ≤2.5s / INP ≤200ms / CLS ≤0.1, and transform/opacity preference; layout/paint-heavy motion requires runtime trace evidence.
- No repo-wide formatting/codemod and no unrelated dirty-file edits or staging.

## Contract

Each index record must contain `slug`, `name`, `status`, `verified_on`, `official_sources`, `stack_fit`, `capabilities`, `avoid_when`, `stop_rules`, `cost`, `complexity`, `progressive_enhancement`, `reduced_motion`, `performance_client_boundary`, `licensing`, `payment`, and `profile_file`.

| Slug | Status | Profile |
|---|---|---|
| `native-web-platform` | `verified` | `profiles/native-web-platform.md` |
| `motion-react` | `verified` | `profiles/motion-react.md` |
| `view-transitions-api` | `verified` | `profiles/view-transitions-api.md` |
| `gsap-scrolltrigger` | `verified` | `profiles/gsap-scrolltrigger.md` |
| `threejs-webgl` | `partial` | `profiles/threejs-webgl.md` |

Every profile covers fit, mechanics, avoid/stop conditions, stack/client boundary, progressive/static fallback, reduced motion, performance measurement, package/API claim status, official sources, licensing/payment, and `verified_on: 2026-07-18`. Use evidenced official domains (`motion.dev`, `developer.mozilla.org`/`developer.chrome.com`, `gsap.com`, `threejs.org`); if a deeper page is inaccessible, retain the official root and mark the exact claim `UNKNOWN`.

## Validation
- `pi_validate_skill(skillPath="/Users/j.henrique/.pi/agent/skills/creative-toolkit")`, then the same tool for `creative-catalog` and `website-stack` — each returns `VALID`.
- `python3 -m json.tool skills/creative-toolkit/tool-index.json >/dev/null` — valid JSON.
- `python3 - <<'PY'
import json, pathlib
root=pathlib.Path('skills/creative-toolkit'); rows=json.loads((root/'tool-index.json').read_text())['tools']
required={'slug','name','status','verified_on','official_sources','stack_fit','capabilities','avoid_when','stop_rules','cost','complexity','progressive_enhancement','reduced_motion','performance_client_boundary','licensing','payment','profile_file'}
assert {r['slug'] for r in rows}=={'native-web-platform','motion-react','view-transitions-api','gsap-scrolltrigger','threejs-webgl'}
assert len(rows)==5 and all(required <= r.keys() for r in rows)
assert all(r['verified_on']=='2026-07-18' and r['official_sources'] and (root/r['profile_file']).is_file() for r in rows)
three=next(r for r in rows if r['slug']=='threejs-webgl'); assert three['status']=='partial' and three['licensing']=='UNKNOWN'
text=(root/'SKILL.md').read_text()+'\n'+'\n'.join((root/r['profile_file']).read_text() for r in rows)
assert all(x in text for x in ('Motion+','HOME_PREVIEW_MODE','motion/react'))
PY` — schema/profile closure and critical policy assertions pass.
- `! grep -in 'framer-motion' skills/website-stack/SKILL.md && grep -n 'npm install motion' skills/website-stack/SKILL.md && grep -n 'motion/react' skills/website-stack/SKILL.md` — stale wording absent; current package/import present.
- `tmp="$(mktemp -d)"; mkdir -p "$tmp/skills/creative-toolkit"; cp -r skills/creative-toolkit/* "$tmp/skills/creative-toolkit/"; diff -qr skills/creative-toolkit "$tmp/skills/creative-toolkit"; rm -rf "$tmp"` — installer-equivalent copy retains nested files.
- `pi_env_inspect(detail="full")` — `creative-toolkit` appears in `skills`.
- `git diff --check -- skills/creative-toolkit skills/creative-catalog/SKILL.md skills/website-stack/SKILL.md && git status --short -- skills/creative-toolkit skills/creative-catalog/SKILL.md skills/website-stack/SKILL.md` — clean patch and focused owned-path status.

## Stop If
- An exact install/import/license/payment fact would need guessing; preserve it as `UNKNOWN`.
- A pattern file, installer, manifest, dependency, or website implementation appears necessary.
- Any task-owned existing file is unexpectedly dirty; report the overlap before editing.

## Checkpoint
- Commit scope: `skills/creative-toolkit/SKILL.md`, `skills/creative-toolkit/tool-index.json`, the five named `skills/creative-toolkit/profiles/*.md`, `skills/creative-catalog/SKILL.md`, `skills/website-stack/SKILL.md`
