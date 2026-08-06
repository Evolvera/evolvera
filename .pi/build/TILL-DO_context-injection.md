# TILL-DO context-injection

## Authority / baseline
- PASS — User contract names exactly two existing extension targets and one new smoke test; host 0.83.0 result contract verified in `dist/core/extensions/runner.js` and `ExtensionContext` has no `systemPrompt`.
- PASS — Existing target helpers mutate `ctx.systemPrompt`; plastic full handler and project bridge handler are the only requested injection surfaces.
- PASS — Relevant existing smoke-test style and fake registration patterns verified in `extensions/test/plastic-memory-surfaces.smoke.mjs` and cutover/install smokes.

## Contract / scope
- PASS — Return `{ systemPrompt: block + "\\n\\n" + event.systemPrompt }`, preserving block bytes and block-first ordering in both handlers.
- PASS — Plastic assigns `currentContext` before fallible root/context assembly, catches assembly failure with no override, and uses a pure combination helper.
- PASS — Exact product write set: `extensions/plastic-memory/index.ts`, `extensions/project-memory.ts`, new `extensions/test/plastic-memory-context-injection.smoke.mjs`; coordinator and all other files untouched.

## Validation / resources
- PASS — User supplied `NO_STATEFUL_RESOURCES`: smoke tests are in-process, synthetic/read-only memory reads, with no server/database/network and no writes under `.pi/memory`.
- PASS — Planned validation: standalone new smoke test, then the requested `extensions/test/plastic-memory-*.smoke.mjs` loop; never start PI agent.

## Recovery / stop gates
- PASS — Listed source targets are clean before edit; no snapshot required under git rollback boundary.
- PASS — Stop if host result contract differs, block preservation conflicts with return transport, or any required change escapes the write set.
